// Chat through the user's own Claude Code / Codex CLI — desktop app only.
// Rust (src-tauri/src/cli_ai.rs) runs the CLI with every tool off, in an empty temp folder, and
// streams the answer back. This side only decides WHAT the CLI may read: the few notes Inkwell's
// own retrieval picked, inside one clearly marked untrusted block. No tool loop, no edit proposals.
import type { Note } from "../data/vault";
import { answeredOnly } from "./history";
import type { AgentResult, ChatMsg } from "./agent";
import type { CliFound, Provider } from "./providers";

const NOTE_CHARS = 2000;
const HISTORY_MSGS = 8;
const HISTORY_CHARS = 600;

/** Neutralise anything in note text that could open or close Inkwell's untrusted blocks. */
const fenceSafe = (s: string) => s.replace(/<\s*\/?\s*untrusted_(?:notes|text)\b[^>]*>/gi, "[tag removed]");

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "\n…(truncated)" : s);

/** The single prompt a CLI provider gets: rules, the picked notes as untrusted data, the chat, the question. */
export function buildCliPrompt(messages: ChatMsg[], notes: Note[], map = ""): string {
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  const question = lastUser >= 0 ? messages[lastUser].content : "";
  const history = answeredOnly(messages.slice(0, Math.max(0, lastUser)))
    .slice(-HISTORY_MSGS)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${fenceSafe(clip(m.content, HISTORY_CHARS))}`);
  const body = notes.length
    ? notes
        .map((n) => `### ${fenceSafe(n.title)} [${fenceSafe(n.folder || "/")}]\n${fenceSafe(clip(n.content ?? "", NOTE_CHARS))}`)
        .join("\n\n---\n\n")
    : "(no clearly relevant notes found)";
  // every note's title/folder/links, so "what are my notes about?" has something to go on
  const index = map.trim()
    ? `VAULT MAP (each note's title [folder] #tags → links):\n${fenceSafe(map)}\n\nNOTES MOST RELEVANT TO THE QUESTION:\n`
    : "";
  return [
    "Answer the user's latest question using ONLY the notes in the untrusted notes block below. " +
      "Cite each note you use as a [[Note Title]] wikilink. If the notes don't contain the answer, say so plainly. " +
      "You can't create or edit notes here: if asked to, say that edit proposals aren't available with this provider and show the suggested text instead.",
    `<untrusted_notes>\n${index}${body}\n</untrusted_notes>`,
    history.length ? `Conversation so far:\n${history.join("\n")}` : "",
    `Latest question:\n${fenceSafe(question)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function core() {
  return import("@tauri-apps/api/core");
}

let nextRun = 0;

interface RunOpts {
  provider: Provider;
  prompt: string;
  onText: (chunk: string) => void;
  signal?: AbortSignal;
}

/** Run `prompt` through the provider's CLI; answer chunks go to onText. Aborting kills the process. */
export async function runCli({ provider, prompt, onText, signal }: RunOpts): Promise<AgentResult> {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const { Channel, invoke } = await core();
  // unique per run, so a late Stop can never hit the next question
  const runId = Date.now() * 1000 + (nextRun++ % 1000);
  const onEvent = new Channel<{ text: string }>();
  onEvent.onmessage = (m) => {
    if (!signal?.aborted && m.text) onText(m.text);
  };
  const cancel = () => void invoke("cli_ai_cancel", { runId }).catch(() => {});
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const r = await invoke<{ text: string; tokens: number }>("cli_ai_run", {
      provider: provider.id,
      prompt,
      runId,
      onEvent,
    });
    return { text: r.text.trim() || "(no answer)", tokens: r.tokens };
  } catch (e) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    throw new Error(e instanceof Error ? e.message : String(e));
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/** Inline editor actions: one transform of the selection, returned whole. */
export async function cliComplete(provider: Provider, instruction: string, selection: string, signal?: AbortSignal): Promise<string> {
  const prompt =
    `Apply this instruction to the text in the <untrusted_text> block and reply with ONLY the resulting Markdown — ` +
    `no preamble, no explanation, no surrounding quotes. Preserve the author's voice, Markdown, [[wikilinks]] and headings unless the instruction says otherwise.\n\n` +
    `Instruction: ${fenceSafe(instruction)}\n\n<untrusted_text>\n${fenceSafe(selection)}\n</untrusted_text>`;
  const r = await runCli({ provider, prompt, onText: () => {}, signal });
  return r.text;
}

/** Which CLIs are installed (desktop app). */
export async function detectClis(): Promise<NonNullable<CliFound>> {
  const { invoke } = await core();
  return invoke<NonNullable<CliFound>>("cli_ai_detect", {});
}
