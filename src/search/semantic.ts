// Fully-local semantic search: embeds notes with a small transformer (all-MiniLM-L6-v2, ~23MB,
// shipped with the app) that runs in the on-device ML worker (src/ml/), off the main thread.
// No API, no server — embeddings and search all happen on-device.
import type { Note } from "../data/vault";
import { loadOnce } from "../loadOnce";
import { ml } from "../ml/host";

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

interface Entry {
  hash: number;
  vec: Float32Array;
}
const index = new Map<string, Entry>();

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Embed every note that's new or changed since the last call (others are reused from cache). */
async function buildIndex(notes: Note[], onProgress?: (p: LoadProgress) => void): Promise<void> {
  const live = new Set(notes.map((n) => n.id));
  for (const id of [...index.keys()]) if (!live.has(id)) index.delete(id); // drop removed notes

  const todo = notes.filter((n) => {
    const text = noteText(n);
    const h = hash(text);
    const cached = index.get(n.id);
    return !cached || cached.hash !== h;
  });

  let done = 0;
  for (const n of todo) {
    const text = noteText(n);
    const vec = await embed(text, onProgress);
    index.set(n.id, { hash: hash(text), vec });
    done++;
    onProgress?.({ stage: "embedding", ratio: done / todo.length });
  }
  onProgress?.({ stage: "ready" });
}

export interface SemanticHit {
  id: string;
  score: number;
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
  return [...index.entries()]
    .map(([id, e]) => ({ id, score: dot(qv, e.vec) }))
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
    .filter(([nid]) => nid !== id)
    .map(([nid, e]) => ({ id: nid, score: dot(self.vec, e.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
