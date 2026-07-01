// Fully-local semantic search: embeds notes with a small transformer that runs in the browser
// (transformers.js / all-MiniLM-L6-v2, ~23MB, cached by the browser after first download).
// No API, no server — embeddings and search all happen on-device.
import type { Note } from "../data/vault";

export interface LoadProgress {
  stage: "download" | "ready" | "embedding";
  /** 0–1 for download / embedding progress. */
  ratio?: number;
  file?: string;
}

// transformers.js is heavy and dynamically imported; `any` avoids pulling its types into the main build.
/* eslint-disable @typescript-eslint/no-explicit-any */
let extractor: any = null;
let loadingPipe: Promise<any> | null = null;

/** Load (once) the on-device embedding model, reporting download progress. */
async function getExtractor(onProgress?: (p: LoadProgress) => void): Promise<any> {
  if (extractor) return extractor;
  if (!loadingPipe) {
    loadingPipe = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      // always pull the model from the HF hub (we don't ship a local copy), and let the browser cache it
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        dtype: "q8", // the ~23MB quantized weights
        progress_callback: (e: any) => {
          if (e?.status === "progress" && typeof e.progress === "number") {
            onProgress?.({ stage: "download", ratio: e.progress / 100, file: e.file });
          }
        },
      });
      extractor = pipe;
      return pipe;
    })();
  }
  return loadingPipe;
}

/** True once the model has finished loading (so the UI can skip the "first run downloads…" note). */
export function isModelReady(): boolean {
  return !!extractor;
}

async function embed(text: string, onProgress?: (p: LoadProgress) => void): Promise<Float32Array> {
  const pipe = await getExtractor(onProgress);
  const out = await pipe(text.slice(0, 2000), { pooling: "mean", normalize: true });
  return out.data as Float32Array;
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
