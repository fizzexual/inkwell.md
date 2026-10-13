// Fully-local semantic search: embeds notes with a small transformer (all-MiniLM-L6-v2, ~23MB,
// shipped with the app) that runs in the on-device ML worker (src/ml/), off the main thread.
// No API, no server — embeddings and search all happen on-device.
// The vault's PDFs (src/search/pdfIndex.ts) are indexed alongside the notes, one vector per passage.
import type { Note } from "../data/vault";
import { loadOnce } from "../loadOnce";
import { ml } from "../ml/host";
import models from "../ml/models.json";
import { openVectorStore, type StoredVector } from "./vectorStore";
import { parsePassageKey, passageKey, usePdfIndex } from "./pdfIndex";
import { pdfName } from "./pdfText";

export interface LoadProgress {
  stage: "download" | "ready" | "embedding";
  /** 0–1 for model loading / embedding progress. */
  ratio?: number;
  file?: string;
}

// progress goes to whoever is waiting on the current load
let loadProgress: ((p: LoadProgress) => void) | undefined;

/** Load (once) the on-device embedding model in the worker; a failed load is retried next time. */
const loadExtractor = loadOnce<null>(() =>
  ml.load("embed", (ratio, file) => loadProgress?.({ stage: "download", ratio, file })),
);

function getExtractor(onProgress?: (p: LoadProgress) => void): Promise<null> {
  if (onProgress) loadProgress = onProgress;
  return loadExtractor();
}

/** True once the model has finished loading (so the UI can skip the "first run downloads…" note). */
export function isModelReady(): boolean {
  return loadExtractor.ready();
}

async function embed(text: string, onProgress?: (p: LoadProgress) => void): Promise<Float32Array> {
  await getExtractor(onProgress);
  return ml.embed(text.slice(0, 2000));
}

/** The text we embed for a note: its title carries a lot of signal, then the (stripped) body. */
function noteText(n: Note): string {
  const body = (n.content ?? "")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/[#>*`_[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${n.title}\n\n${body}`;
}

// cheap, stable content hash so we only re-embed a note when its text actually changes
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Stored vectors are only valid for the exact model + text recipe that made them; bump
// TEXT_VERSION when noteText() changes so every stored vector is thrown away.
const TEXT_VERSION = 1;
const MODEL_KEY = `${models.embed.id}@${models.embed.revision}/${models.embed.dtype}/text${TEXT_VERSION}`;
const store = openVectorStore(MODEL_KEY);

const index = new Map<string, StoredVector>();

// On launch, load the vectors from the last session so related notes / search work without
// re-embedding the vault (only notes whose text changed get embedded again).
const hydrated: Promise<void> = store.loadAll().then((saved) => {
  for (const [id, e] of saved) if (!index.has(id)) index.set(id, e);
});

/** Resolves once the vectors saved by the last session are loaded (or there were none). */
export function whenIndexLoaded(): Promise<void> {
  return hydrated;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** The vault's PDF passages: index id → what was found (file, page, text) and the text we embed. */
function pdfPassages(): Map<string, { rel: string; page: number; text: string; embedText: string }> {
  const out = new Map<string, { rel: string; page: number; text: string; embedText: string }>();
  for (const d of usePdfIndex.getState().docs) {
    for (const p of d.passages) {
      out.set(passageKey(d.rel, p.page, p.idx), {
        rel: d.rel,
        page: p.page,
        text: p.text,
        embedText: `${pdfName(d.rel)}, page ${p.page}\n\n${p.text}`,
      });
    }
  }
  return out;
}

const isPdfId = (id: string) => parsePassageKey(id) !== null;

/** Embed every note and PDF passage that's new or changed since the last call (others are reused). */
async function buildIndex(notes: Note[], onProgress?: (p: LoadProgress) => void): Promise<void> {
  await hydrated;
  const pdf = pdfPassages();
  const gone: string[] = [];
  // drop removed notes — but an empty list is a vault that hasn't loaded yet, not "delete everything"
  if (notes.length) {
    const live = new Set(notes.map((n) => n.id));
    const goneNotes = [...index.keys()].filter((id) => !isPdfId(id) && !live.has(id));
    // a note that only moved (its id is its file path in a disk vault) keeps its text: hand the
    // vector of a vanished id with the same text hash to it instead of embedding it again
    const spare = new Map(goneNotes.map((id) => [index.get(id)!.hash, index.get(id)!]));
    for (const n of notes) {
      if (index.has(n.id)) continue;
      const e = spare.get(hash(noteText(n)));
      if (!e) continue;
      spare.delete(e.hash);
      index.set(n.id, e);
      void store.put(n.id, e);
    }
    gone.push(...goneNotes);
  }
  // same for PDFs: only once the PDF index reflects this vault's Attachments/ folder
  if (usePdfIndex.getState().ready) gone.push(...[...index.keys()].filter((id) => isPdfId(id) && !pdf.has(id)));
  for (const id of gone) index.delete(id);
  void store.remove(gone);

  const todo: { id: string; text: string }[] = [
    ...notes.map((n) => ({ id: n.id, text: noteText(n) })),
    ...[...pdf].map(([id, p]) => ({ id, text: p.embedText })),
  ].filter(({ id, text }) => index.get(id)?.hash !== hash(text));

  let done = 0;
  for (const { id, text } of todo) {
    const entry = { hash: hash(text), vec: await embed(text, onProgress) };
    index.set(id, entry);
    void store.put(id, entry);
    done++;
    onProgress?.({ stage: "embedding", ratio: done / todo.length });
  }
  onProgress?.({ stage: "ready" });
}

export interface SemanticHit {
  /** a note id — or, for a PDF passage, its passage key (see `pdf`). */
  id: string;
  score: number;
  /** set when the hit is a passage of a PDF in the vault. */
  pdf?: { rel: string; page: number; text: string };
}

/** Make sure every note is embedded (new/changed ones only). Public wrapper around the index build. */
export async function ensureIndexed(notes: Note[], onProgress?: (p: LoadProgress) => void): Promise<void> {
  await buildIndex(notes, onProgress);
}

/** True once at least one note has an embedding cached — so the UI can show related notes instantly. */
export function isIndexWarm(): boolean {
  return index.size > 0;
}

/**
 * Rank notes by semantic similarity to the query. Builds/refreshes the on-device index first
 * (only new/changed notes are re-embedded), then cosine-ranks against the query embedding.
 */
export async function semanticSearch(
  query: string,
  notes: Note[],
  k = 12,
  onProgress?: (p: LoadProgress) => void,
): Promise<SemanticHit[]> {
  const q = query.trim();
  if (!q) return [];
  await buildIndex(notes, onProgress);
  const qv = await embed(q);
  // PDF vectors not in the current PDF index (another vault, not listed yet) are never shown
  const pdf = pdfPassages();
  return [...index.entries()]
    .filter(([id]) => !isPdfId(id) || pdf.has(id))
    .map(([id, e]): SemanticHit => {
      const p = pdf.get(id);
      const hit: SemanticHit = { id, score: dot(qv, e.vec) };
      if (p) hit.pdf = { rel: p.rel, page: p.page, text: p.text };
      return hit;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** The notes most similar in MEANING to one note — associative "related notes" beyond explicit links. */
export async function relatedNotes(
  id: string,
  notes: Note[],
  k = 6,
  onProgress?: (p: LoadProgress) => void,
): Promise<SemanticHit[]> {
  await buildIndex(notes, onProgress);
  const self = index.get(id);
  if (!self) return [];
  return [...index.entries()]
    .filter(([nid]) => nid !== id && !isPdfId(nid))
    .map(([nid, e]) => ({ id: nid, score: dot(self.vec, e.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
