// The text of every PDF in the vault's Attachments/ folder, for search. Extracted once per PDF
// version (size + modified time) and kept in IndexedDB, so a restart — or a PDF that didn't
// change — never re-parses it. A sync lists the folder: new PDFs are read, changed ones re-read,
// deleted ones dropped. Any IndexedDB failure only costs the cache, never the search.
import { create } from "zustand";
import { listPdfAttachments, readAttachment, type PdfFileInfo } from "../vault/attachments";
import { extractPdfPages, isScanned, pdfName, splitPassages, type PdfDocText } from "./pdfText";

export interface PdfIndexState {
  /** the vault these PDFs belong to (null = none open). */
  vault: string | null;
  /** the vault's PDFs, sorted by path (scans included, with `scanned` set). */
  docs: PdfDocText[];
  /** true once `docs` matches the vault's Attachments/ listing (a missing PDF really is gone). */
  ready: boolean;
  /** PDFs still being read. */
  pending: number;
  /** PDFs that couldn't be read or parsed (damaged, password-protected…). */
  failed: string[];
}

export const usePdfIndex = create<PdfIndexState>(() => ({ vault: null, docs: [], ready: false, pending: 0, failed: [] }));

/** The short status line for the search panels. */
export function pdfStatus(s: PdfIndexState) {
  return {
    searchable: s.docs.filter((d) => !d.scanned).length,
    scanned: s.docs.filter((d) => d.scanned).map((d) => pdfName(d.rel)),
    failed: s.failed.map(pdfName),
    pending: s.pending,
  };
}

// ---- passage ids in the semantic index ----

const KEY = /^pdf:(.+)#(\d+)\.(\d+)$/;

/** The semantic-index id of one passage. */
export const passageKey = (rel: string, page: number, idx: number) => `pdf:${rel}#${page}.${idx}`;

export function parsePassageKey(key: string): { rel: string; page: number; idx: number } | null {
  const m = KEY.exec(key);
  return m ? { rel: m[1], page: Number(m[2]), idx: Number(m[3]) } : null;
}

// ---- the IndexedDB cache: one row per (vault, PDF) ----

// bump when splitPassages()/pageText() change, so every cached PDF is extracted again
const TEXT_VERSION = 1;
const DB = "inkwell-pdf-text";
const STORE = "docs";

interface Row extends PdfDocText {
  key: string;
  vault: string;
  /** size:modified of the file the text came from */
  fp: string;
  v: number;
}

const fingerprint = (f: PdfFileInfo) => `${f.size}:${f.modified}`;
const rowKey = (vault: string, rel: string) => `${vault}\n${rel}`;

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  return (dbp ??= new Promise((resolve) => {
    try {
      const idb = globalThis.indexedDB as IDBFactory | undefined;
      if (!idb) return resolve(null);
      const req = idb.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => d.close();
        resolve(d);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });

async function loadRows(vault: string): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  try {
    const d = await db();
    if (!d) return out;
    const tx = d.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const row = cur.value as Row;
      if (row.vault === vault && row.v === TEXT_VERSION) out.set(row.rel, row);
      cur.continue();
    };
    await done(tx);
  } catch {
    out.clear();
  }
  return out;
}

async function write(f: (s: IDBObjectStore) => void): Promise<void> {
  try {
    const d = await db();
    if (!d) return;
    const tx = d.transaction(STORE, "readwrite");
    f(tx.objectStore(STORE));
    await done(tx);
  } catch {
    /* not cached — it is extracted again next launch */
  }
}

// ---- sync ----

const toDoc = ({ rel, pages, passages, scanned }: Row): PdfDocText => ({ rel, pages, passages, scanned });
const byRel = (a: PdfDocText, b: PdfDocText) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);

let wanted: string | null = null;
// PDFs that couldn't be read (vault + rel → fingerprint): retried only once the file changes
const failedAt = new Map<string, string>();
let chain: Promise<void> = Promise.resolve();

/**
 * Bring the PDF index in line with `vault`'s Attachments/ folder (null = no vault: empty index).
 * Syncs run one after another; one for a different vault stops the extraction of the previous.
 */
export function syncPdfIndex(vault: string | null): Promise<void> {
  wanted = vault;
  chain = chain.then(() => run(vault)).catch((e) => console.error("PDF index:", e));
  return chain;
}

async function run(vault: string | null): Promise<void> {
  if (!vault) {
    usePdfIndex.setState({ vault: null, docs: [], ready: false, pending: 0, failed: [] });
    return;
  }
  if (wanted !== vault) return; // superseded before it started

  const rows = await loadRows(vault);
  let files: PdfFileInfo[];
  try {
    files = await listPdfAttachments();
  } catch (e) {
    console.error("PDF index: couldn't list Attachments/", e);
    return; // keep what we had — a failed listing is not "every PDF was deleted"
  }
  if (wanted !== vault) return;

  const live = new Set(files.map((f) => f.rel));
  const gone = [...rows.keys()].filter((rel) => !live.has(rel));
  if (gone.length) void write((s) => gone.forEach((rel) => s.delete(rows.get(rel)!.key)));

  const broken = (f: PdfFileInfo) => failedAt.get(rowKey(vault, f.rel)) === fingerprint(f);
  const todo = files.filter((f) => rows.get(f.rel)?.fp !== fingerprint(f) && !broken(f));
  // until a changed PDF is re-read, its old text stays searchable
  const docs = files.flatMap((f) => (rows.has(f.rel) ? [toDoc(rows.get(f.rel)!)] : [])).sort(byRel);
  usePdfIndex.setState({ vault, docs, ready: true, pending: todo.length, failed: files.filter(broken).map((f) => f.rel) });

  for (const f of todo) {
    if (wanted !== vault) return;
    let row: Row | null = null;
    try {
      const pages = await extractPdfPages(await readAttachment(f.rel));
      const scanned = isScanned(pages);
      row = {
        key: rowKey(vault, f.rel),
        vault,
        rel: f.rel,
        fp: fingerprint(f),
        v: TEXT_VERSION,
        pages: pages.length,
        passages: scanned ? [] : splitPassages(pages),
        scanned,
      };
    } catch (e) {
      console.error(`PDF index: couldn't read ${f.rel}`, e);
      failedAt.set(rowKey(vault, f.rel), fingerprint(f));
    }
    if (wanted !== vault) return;
    const s = usePdfIndex.getState();
    if (row) {
      const r = row;
      void write((st) => st.put(r));
      usePdfIndex.setState({
        docs: [...s.docs.filter((d) => d.rel !== f.rel), toDoc(r)].sort(byRel),
        failed: s.failed.filter((x) => x !== f.rel),
        pending: s.pending - 1,
      });
    } else {
      usePdfIndex.setState({
        docs: s.docs.filter((d) => d.rel !== f.rel),
        failed: [...new Set([...s.failed, f.rel])],
        pending: s.pending - 1,
      });
    }
  }
}
