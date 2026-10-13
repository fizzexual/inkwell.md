// Text inside the vault's PDFs, for search: pdf.js pulls each page's text, then it is cut into a
// few passages per page (each keeps its page number) for the semantic index, and searched as
// plain text for the full-text search panel.
import { makeSnippet, type Snippet } from "./snippet";

export interface PdfPassage {
  /** 1-based page number. */
  page: number;
  /** passage number within the page (0, 1, 2). */
  idx: number;
  text: string;
}

/** What the search knows about one PDF in the vault. */
export interface PdfDocText {
  /** vault-relative path, e.g. `Attachments/paper.pdf`. */
  rel: string;
  pages: number;
  passages: PdfPassage[];
  /** no text layer at all (a scan) — nothing in it can be searched. */
  scanned: boolean;
}

export interface PdfTextHit {
  rel: string;
  name: string;
  page: number;
  snippet: Snippet;
}

export const pdfName = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);

/** One page's text from pdf.js `getTextContent().items`: the runs joined, line ends as spaces. */
export function pageText(items: readonly object[]): string {
  let out = "";
  for (const it of items) {
    if (!("str" in it) || typeof it.str !== "string") continue; // marked-content markers
    out += it.str;
    if ("hasEOL" in it && it.hasEOL) out += " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

/** A page longer than this is cut into 2–3 passages (one embedding each). */
const PASSAGE_CHARS = 900;
const MAX_PER_PAGE = 3;

/** Where to cut `t` near `target`: just after a sentence end, else at a space, else right there. */
function cutAt(t: string, target: number, min: number): number {
  const sentence = /[.!?]\s/g;
  sentence.lastIndex = Math.max(min, target - 250);
  let best = -1;
  for (let m = sentence.exec(t); m && m.index <= target + 250; m = sentence.exec(t)) {
    const at = m.index + 1;
    if (best < 0 || Math.abs(at - target) < Math.abs(best - target)) best = at;
  }
  if (best > min) return best;
  const space = t.indexOf(" ", target);
  return space > min ? space : target;
}

/** Each page's text → 1–3 passages, in order, each tagged with its page. Blank pages give none. */
export function splitPassages(pages: string[]): PdfPassage[] {
  const out: PdfPassage[] = [];
  pages.forEach((raw, i) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return;
    const n = Math.min(MAX_PER_PAGE, Math.ceil(t.length / PASSAGE_CHARS));
    let from = 0;
    for (let k = 1; k <= n; k++) {
      const to = k === n ? t.length : cutAt(t, Math.round((k * t.length) / n), from);
      const text = t.slice(from, to).trim();
      if (text) out.push({ page: i + 1, idx: out.filter((p) => p.page === i + 1).length, text });
      from = to;
    }
  });
  return out;
}

/** True when no page has a text layer: a scan, which only OCR could make searchable. */
export function isScanned(pages: string[]): boolean {
  return pages.every((p) => !p.trim());
}

/** The slice of pdf.js this needs (the app's bundled build, or the Node build in tests). */
export interface PdfLib {
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: readonly object[] }>; cleanup(): unknown }>;
    }>;
    destroy(): Promise<void>;
  };
}

const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * The text of every page, in order. pdf.js parses in its own worker; between pages we hand the
 * main thread back, so a 500-page book never freezes the UI.
 */
export async function extractPdfPages(data: ArrayBuffer | Uint8Array, lib?: PdfLib): Promise<string[]> {
  const pdf = lib ?? ((await import("../pdf")).pdfjs as unknown as PdfLib);
  const task = pdf.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data) });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      pages.push(pageText((await page.getTextContent()).items));
      page.cleanup();
      await nextTask();
    }
    return pages;
  } finally {
    void task.destroy();
  }
}

/** Plain-text search over the PDFs: one hit per page that contains `query` (case-insensitive). */
export function searchPdfText(docs: PdfDocText[], query: string, limit = 50): PdfTextHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: PdfTextHit[] = [];
  for (const d of docs) {
    // a page's passages joined back together, so a phrase cut between two passages is still found
    const byPage = new Map<number, string[]>();
    for (const p of d.passages) byPage.set(p.page, [...(byPage.get(p.page) ?? []), p.text]);
    for (const [page, parts] of [...byPage].sort((a, b) => a[0] - b[0])) {
      const snippet = makeSnippet(parts.join(" "), q);
      if (!snippet) continue;
      hits.push({ rel: d.rel, name: pdfName(d.rel), page, snippet });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}
