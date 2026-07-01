import { getProvider, type Provider } from "./providers";
import { useChat } from "./useChat";

/** The inline editor actions. Each maps to an instruction + whether it replaces the selection or appends after it. */
export type InlineAction = "rephrase" | "grammar" | "shorten" | "expand" | "continue" | "custom";

export interface ActionSpec {
  id: InlineAction;
  label: string;
  /** how the result is applied: "replace" the selection, or "after" (keep it, append the result). */
  mode: "replace" | "after";
  instruction: (custom?: string) => string;
}

export const INLINE_ACTIONS: ActionSpec[] = [
  {
    id: "rephrase",
    label: "Rephrase",
    mode: "replace",
    instruction: () => "Rewrite the selected text more clearly and naturally, keeping the same meaning, tone and length.",
  },
  {
    id: "grammar",
    label: "Fix grammar",
    mode: "replace",
    instruction: () => "Correct any spelling, grammar and punctuation mistakes in the selected text. Change nothing else — keep the wording and meaning identical.",
  },
  {
    id: "shorten",
    label: "Make shorter",
    mode: "replace",
    instruction: () => "Rewrite the selected text to be significantly more concise, keeping every key point. Return only the shortened text.",
  },
  {
    id: "expand",
    label: "Expand",
    mode: "replace",
    instruction: () => "Expand the selected text with more detail, explanation and supporting points, keeping the same voice and Markdown style.",
  },
  {
    id: "continue",
    label: "Continue writing",
    mode: "after",
    instruction: () => "Continue writing naturally from where the selected text ends. Return ONLY the continuation (do not repeat the selected text), matching its voice and Markdown style.",
  },
  {
    id: "custom",
    label: "Custom…",
    mode: "replace",
    instruction: (custom) => custom?.trim() || "Improve the selected text.",
  },
];

const SYSTEM =
  "You are a precise writing assistant embedded directly in a Markdown note editor. " +
  "You are given the user's selected text and an instruction. Apply the instruction and reply with ONLY the resulting Markdown — " +
  "no preamble, no explanation, no surrounding quotes, and no ``` code fences unless the text itself is code. " +
  "Preserve the author's voice and any Markdown formatting, [[wikilinks]], [@citations] and headings unless the instruction says to change them.";

/** Strip wrappers a model sometimes adds despite instructions: a single fenced block or matching outer quotes. */
function clean(text: string): string {
  let s = text.trim();
  const fence = s.match(/^```[\w-]*\n([\s\S]*?)\n?```$/);
  if (fence) s = fence[1].trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("“") && s.endsWith("”"))) s = s.slice(1, -1).trim();
  return s;
}

async function errText(res: Response): Promise<string> {
  let d = await res.text();
  try {
    d = JSON.parse(d).error?.message ?? d;
  } catch {
    /* raw */
  }
  return d.slice(0, 300);
}

async function runOpenAI(
  p: Provider,
  key: string,
  model: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${key || "local"}` };
  if (p.id === "openrouter") {
    headers["HTTP-Referer"] = location.origin;
    headers["X-Title"] = "Inkwell";
  }
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${p.label} ${res.status}: ${await errText(res)}`);
  const data: { choices?: { message?: { content?: string } }[] } = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

async function runAnthropic(
  p: Provider,
  key: string,
  model: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${p.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    signal,
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`${p.label} ${res.status}: ${await errText(res)}`);
  const data: { content?: { type: string; text?: string }[] } = await res.json();
  return (data.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") || "").trim();
}

/**
 * Single-shot transform of a piece of text using the provider/key/model already configured for the assistant.
 * No vault tools and no note context — deliberately cheap (only the selection is sent).
 */
export async function completeText(instruction: string, selection: string, signal?: AbortSignal): Promise<string> {
  const s = useChat.getState();
  const provider = getProvider(s.provider);
  const apiKey = (s.keys[provider.id] || "").trim();
  if (!apiKey && !provider.keyless) throw new Error(`Add a ${provider.label} API key in the assistant first.`);

  const user = `Instruction: ${instruction}\n\nSelected text:\n"""\n${selection}\n"""`;
  const raw =
    provider.kind === "anthropic"
      ? await runAnthropic(provider, apiKey, s.model, user, signal)
      : await runOpenAI(provider, apiKey, s.model, user, signal);
  const out = clean(raw);
  if (!out) throw new Error("The model returned nothing.");
  return out;
}
