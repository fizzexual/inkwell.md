import type { Note } from "../data/vault";
import { parseTags } from "../markdown";
import type { Provider } from "./providers";

/** Everything the agent needs to read the vault, pulled from the store at send time. */
export interface VaultAccess {
  notes: Note[];
  resolve: (title: string) => string | undefined;
  getNote: (id: string) => Note | undefined;
  linksOf: (id: string) => Note[];
  backlinksOf: (id: string) => Note[];
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

/** A visible step the agent took — surfaced in the UI so graph navigation is observable. */
export interface AgentStep {
  kind: "search" | "links" | "read" | "wait";
  detail: string;
}

const stripBody = (md: string) =>
  md
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^#\s+.*$/m, "")
    .replace(/[#>*`_\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Compact index of the whole vault: title, folder, tags and the link graph (→). Cheap to send. */
function buildMap(v: VaultAccess): string {
  return v.notes
    .map((n) => {
      const tags = parseTags(n.content ?? "");
      const links = v.linksOf(n.id).map((l) => l.title);
      const t = tags.length ? " " + tags.map((x) => "#" + x).join(" ") : "";
      const l = links.length ? " → " + links.join(", ") : "";
      return `- ${n.title} [${n.folder || "/"}]${t}${l}`;
    })
    .join("\n");
}

function systemPrompt(v: VaultAccess): string {
  return `You are the research assistant built into Inkwell, a personal knowledge vault. Answer the user's questions using ONLY the contents of their vault.

You are given a MAP of every note below: its title, folder, #tags and the notes it links to (→). Treat that link graph as your index. To stay fast and cheap you must NOT read the whole vault — use the map to decide which few notes are relevant, then read only those.

Tools:
- search_vault(query): keyword search → matching note titles with a short snippet. Use it to find entry points when the map titles alone aren't enough.
- explore_links(title): returns the notes a given note links to and the notes that link back to it. Use it to walk the graph outward from a relevant note.
- read_notes(titles): returns the full text of the named notes. Read only what you genuinely need to answer.

Work in small steps: locate the few relevant notes from the map / search / links, read just those, then answer concisely. Cite every note you used as a [[Note Title]] wikilink so the user can click it. If the vault doesn't contain the answer, say so plainly — never invent facts that aren't in the notes.

VAULT MAP (${v.notes.length} notes):
${buildMap(v)}`;
}

const tools = [
  {
    name: "search_vault",
    description: "Keyword search across note titles and bodies. Returns up to 6 matches with a short snippet.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Keywords to search for." } },
      required: ["query"],
    },
  },
  {
    name: "explore_links",
    description: "Return the notes that the given note links to (outgoing) and that link back to it (backlinks), plus its tags. Use to walk the knowledge graph.",
    input_schema: {
      type: "object",
      properties: { title: { type: "string", description: "Exact note title to expand." } },
      required: ["title"],
    },
  },
  {
    name: "read_notes",
    description: "Return the full markdown text of one or more notes by title. Read only the notes you need.",
    input_schema: {
      type: "object",
      properties: { titles: { type: "array", items: { type: "string" }, description: "Note titles to read." } },
      required: ["titles"],
    },
  },
];

function runTool(name: string, input: Record<string, unknown>, v: VaultAccess): string {
  if (name === "search_vault") {
    const q = String(input.query ?? "").toLowerCase().trim();
    if (!q) return "Empty query.";
    const words = q.split(/\s+/);
    const scored = v.notes
      .map((n) => {
        const title = n.title.toLowerCase();
        const body = (n.content ?? "").toLowerCase();
        let score = title.includes(q) ? 4 : 0;
        for (const w of words) {
          if (title.includes(w)) score += 2;
          if (body.includes(w)) score += 1;
        }
        return { n, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    if (!scored.length) return "No matching notes.";
    return scored
      .map(({ n }) => `- ${n.title} [${n.folder || "/"}] — ${stripBody(n.content ?? "").slice(0, 160)}`)
      .join("\n");
  }

  if (name === "explore_links") {
    const id = v.resolve(String(input.title ?? ""));
    const note = id ? v.getNote(id) : undefined;
    if (!note) return `Note not found: "${input.title}".`;
    const out = v.linksOf(note.id).map((l) => l.title);
    const back = v.backlinksOf(note.id).map((l) => l.title);
    const tags = parseTags(note.content ?? "");
    return [
      `Note: ${note.title} [${note.folder || "/"}]`,
      `Tags: ${tags.length ? tags.map((t) => "#" + t).join(" ") : "(none)"}`,
      `Links to: ${out.length ? out.join(", ") : "(none)"}`,
      `Linked from: ${back.length ? back.join(", ") : "(none)"}`,
    ].join("\n");
  }

  if (name === "read_notes") {
    const titles = Array.isArray(input.titles) ? (input.titles as unknown[]).map(String).slice(0, 5) : [];
    if (!titles.length) return "No titles given.";
    return titles
      .map((t) => {
        const id = v.resolve(t);
        const note = id ? v.getNote(id) : undefined;
        if (!note) return `### ${t}\n(not found)`;
        const full = note.content ?? "";
        const body = full.slice(0, 2600);
        return `### ${note.title}\n${body}${full.length > 2600 ? "\n…(truncated)" : ""}`;
      })
      .join("\n\n---\n\n");
  }

  return `Unknown tool: ${name}`;
}

interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

async function readError(res: Response): Promise<string> {
  let detail = await res.text();
  try {
    detail = JSON.parse(detail).error?.message ?? detail;
  } catch {
    /* keep raw text */
  }
  return detail.slice(0, 400);
}

function emitStep(name: string, input: Record<string, unknown>, onStep: (s: AgentStep) => void) {
  if (name === "search_vault") onStep({ kind: "search", detail: String(input.query ?? "") });
  else if (name === "explore_links") onStep({ kind: "links", detail: String(input.title ?? "") });
  else if (name === "read_notes")
    onStep({ kind: "read", detail: (Array.isArray(input.titles) ? input.titles : []).map(String).join(", ") });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** How long to wait before retrying a 429 — from the retry-after header or the "try again in Ns" message. */
async function retryDelayMs(res: Response): Promise<number> {
  const h = res.headers.get("retry-after");
  if (h && !Number.isNaN(Number(h))) return Math.min(Number(h) * 1000 + 300, 65000);
  try {
    const m = (await res.clone().text()).match(/try again in ([\d.]+)\s*s/i);
    if (m) return Math.min(parseFloat(m[1]) * 1000 + 300, 65000);
  } catch {
    /* ignore */
  }
  return 5000;
}

/** POST that transparently waits out free-tier rate limits (HTTP 429) up to a few times. */
async function postWithRetry(
  url: string,
  init: RequestInit,
  provider: Provider,
  onStep: (s: AgentStep) => void,
  signal?: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= 3) return res;
    const wait = await retryDelayMs(res);
    if (wait > 65000) return res;
    onStep({ kind: "wait", detail: `${provider.label} rate limit — retrying in ${Math.ceil(wait / 1000)}s` });
    await delay(wait, signal);
  }
}

const NO_CONVERGE = "I looked through several notes but couldn't converge — try narrowing the question.";

interface LoopOpts {
  provider: Provider;
  apiKey: string;
  model: string;
  messages: ChatMsg[];
  vault: VaultAccess;
  onStep: (s: AgentStep) => void;
  signal?: AbortSignal;
}

/** Anthropic Messages API loop (tool_use / tool_result blocks). */
async function loopAnthropic(o: LoopOpts, system: string): Promise<string> {
  const api: unknown[] = o.messages.map((m) => ({ role: m.role, content: m.content }));
  for (let i = 0; i < 8; i++) {
    const res = await postWithRetry(
      `${o.provider.baseUrl}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": o.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: o.model, max_tokens: 1024, system, tools, messages: api }),
        signal: o.signal,
      },
      o.provider,
      o.onStep,
      o.signal,
    );
    if (!res.ok) throw new Error(`${o.provider.label} ${res.status}: ${await readError(res)}`);
    const data: { content: Block[]; stop_reason: string } = await res.json();
    api.push({ role: "assistant", content: data.content });

    if (data.stop_reason !== "tool_use") {
      return (
        data.content
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("")
          .trim() || "(no answer)"
      );
    }
    const results: unknown[] = [];
    for (const block of data.content) {
      if (block.type !== "tool_use" || !block.name) continue;
      const input = block.input ?? {};
      emitStep(block.name, input, o.onStep);
      results.push({ type: "tool_result", tool_use_id: block.id, content: runTool(block.name, input, o.vault) });
    }
    api.push({ role: "user", content: results });
  }
  return NO_CONVERGE;
}

interface OAIToolCall {
  id: string;
  function: { name: string; arguments: string };
}
interface OAIMessage {
  role: string;
  content: string | null;
  tool_calls?: OAIToolCall[];
}

/** OpenAI-compatible Chat Completions loop — covers Groq, OpenRouter, OpenAI, etc. */
async function loopOpenAI(o: LoopOpts, system: string): Promise<string> {
  const oaiTools = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
  const api: unknown[] = [
    { role: "system", content: system },
    ...o.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${o.apiKey}`,
  };
  if (o.provider.id === "openrouter") {
    headers["HTTP-Referer"] = location.origin;
    headers["X-Title"] = "Inkwell";
  }

  for (let i = 0; i < 8; i++) {
    const res = await postWithRetry(
      `${o.provider.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ model: o.model, messages: api, tools: oaiTools, tool_choice: "auto", max_tokens: 1024 }),
        signal: o.signal,
      },
      o.provider,
      o.onStep,
      o.signal,
    );
    if (!res.ok) throw new Error(`${o.provider.label} ${res.status}: ${await readError(res)}`);
    const data: { choices: { message: OAIMessage }[] } = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error(`${o.provider.label}: empty response`);

    if (msg.tool_calls?.length) {
      api.push(msg);
      for (const tc of msg.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* malformed args — pass empty */
        }
        emitStep(tc.function.name, input, o.onStep);
        api.push({ role: "tool", tool_call_id: tc.id, content: runTool(tc.function.name, input, o.vault) });
      }
      continue;
    }
    return (msg.content || "").trim() || "(no answer)";
  }
  return NO_CONVERGE;
}

/**
 * Run the vault agent. Emits its navigation steps via onStep, returns the final answer text.
 * It loops: model picks tools (search / explore_links / read_notes) → we run them locally →
 * feed results back → repeat until it answers (token-cheap, graph-guided retrieval).
 * Dispatches to the right API dialect for the chosen provider.
 */
export function runVaultAgent(o: LoopOpts): Promise<string> {
  const system = systemPrompt(o.vault);
  return o.provider.kind === "anthropic" ? loopAnthropic(o, system) : loopOpenAI(o, system);
}
