// One offline chat turn: retrieve the relevant notes on-device, build one prompt, stream the
// answer from the local model. No tools and no vault edits — a small model can't drive the agent
// loop reliably, so the app does the retrieval and the model only reads and answers.
import chatModel from "../../ml/chat-model.json";
import type { GenerateResult } from "./protocol";
import { buildOfflinePrompt, promptBudgetChars, type ChatTurn } from "./prompt";

export interface OfflineNote {
  id: string;
  title: string;
  content?: string;
}

export interface OfflineDeps {
  notes: OfflineNote[];
  /** on-device semantic search (src/search/semantic.ts) */
  search: (q: string, notes: OfflineNote[], k: number) => Promise<{ id: string; score: number }[]>;
  generate: (messages: ChatTurn[], onToken: (t: string) => void, signal?: AbortSignal) => Promise<GenerateResult>;
}

export interface OfflineAnswer {
  text: string;
  tokens: number;
  /** titles of the notes that were in the prompt */
  sources: string[];
  aborted: boolean;
}

const TOP_K = 5;
/** Cosine similarity below this (all-MiniLM-L6-v2) is noise, not a related note. */
const MIN_SCORE = 0.15;

/** Notes ranked by how often the question's words appear (title counts triple). */
function keywordSearch(q: string, notes: OfflineNote[], k: number): OfflineNote[] {
  const words = [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  return notes
    .map((n) => {
      const title = n.title.toLowerCase();
      const body = (n.content ?? "").toLowerCase();
      const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0), 0);
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.n);
}

async function retrieve(q: string, deps: OfflineDeps): Promise<OfflineNote[]> {
  try {
    const byId = new Map(deps.notes.map((n) => [n.id, n]));
    return (await deps.search(q, deps.notes, TOP_K))
      .filter((h) => h.score >= MIN_SCORE)
      .map((h) => byId.get(h.id))
      .filter((n): n is OfflineNote => !!n);
  } catch (e) {
    console.warn("Inkwell: semantic search unavailable for offline chat, using keywords", e);
    return keywordSearch(q, deps.notes, TOP_K);
  }
}

/** Hide a reasoning block some models emit (also an unfinished one while it streams). */
export const stripThinking = (t: string) => t.replace(/<think>[\s\S]*?(<\/think>\s*|$)/g, "");

/** Small models sometimes write `[[Title|alias]]` or `[[note title="Title"]]`; make them plain links. */
const tidyLinks = (t: string) =>
  t
    .replace(/\[\[\s*note\s+title\s*=\s*"([^"\]]+)"\s*\]\]/gi, "[[$1]]")
    .replace(/\[\[([^\]|]+)\|[^\]]*\]\]/g, "[[$1]]");

export async function runOfflineChat(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  deps: OfflineDeps,
  onToken?: (t: string) => void,
  signal?: AbortSignal,
): Promise<OfflineAnswer> {
  const found = await retrieve(question, deps);
  const { messages, used } = buildOfflinePrompt({
    question,
    history,
    notes: found.map((n) => ({ title: n.title, content: n.content ?? "" })),
    budgetChars: promptBudgetChars(chatModel.contextTokens, chatModel.maxNewTokens),
  });
  const out = await deps.generate(messages, (t) => onToken?.(t), signal);
  const text = tidyLinks(stripThinking(out.text)).trim();
  if (out.aborted || !used.length) return { text, tokens: out.tokens, sources: used, aborted: out.aborted };
  // the notes it was given, always as clickable links (a small model doesn't cite reliably)
  const footer = `\n\n*Notes searched:* ${used.map((t) => `[[${t}]]`).join(" · ")}`;
  return { text: text + footer, tokens: out.tokens, sources: used, aborted: false };
}
