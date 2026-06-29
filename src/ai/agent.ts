import type { Note } from "../data/vault";
import { parseTags } from "../markdown";
import type { Provider } from "./providers";

/** A pending write the agent wants to make — surfaced for the user to approve. */
export interface Proposal {
  id: string;
  kind: "create" | "edit";
  title: string;
  folder?: string;
  content: string;
  targetId?: string;
}

/** Everything the agent needs to read the vault, pulled from the store at send time. */
export interface VaultAccess {
  notes: Note[];
  resolve: (title: string) => string | undefined;
  getNote: (id: string) => Note | undefined;
  linksOf: (id: string) => Note[];
  backlinksOf: (id: string) => Note[];
  /** record a pending write for user approval; returns a status string for the model. */
  propose?: (p: Omit<Proposal, "id">) => string;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  /** assistant-only: timing + token cost for the footer. */
  meta?: { ms: number; tokens: number };
}

/** Final answer plus the total tokens burned across every API call in the turn. */
export interface AgentResult {
  text: string;
  tokens: number;
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
  // kept deliberately lean — this is re-sent on every loop call, so cap tags/links per note
  return v.notes
    .map((n) => {
      const tags = parseTags(n.content ?? "").slice(0, 3);
      const links = v.linksOf(n.id).map((l) => l.title);
      const t = tags.length ? " " + tags.map((x) => "#" + x).join(" ") : "";
      const shown = links.slice(0, 6);
      const l = links.length ? ` → ${shown.join(", ")}${links.length > 6 ? ` +${links.length - 6}` : ""}` : "";
      return `- ${n.title} [${n.folder || "/"}]${t}${l}`;
    })
    .join("\n");
}

function systemPrompt(v: VaultAccess, canWrite: boolean): string {
  const writeNote = canWrite
    ? `\n\nYou may also PROPOSE changes with create_note(title, content, folder?) and edit_note(title, content). These do NOT save directly — the user reviews and approves each one. Only propose a write when the user clearly asks you to create or change a note; otherwise just answer.`
    : "";
  return `You are the research assistant built into Inkwell, a personal knowledge vault. Answer the user's questions using ONLY the contents of their vault.${writeNote}

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

/** Write tools — only offered when the user has allowed edits. They PROPOSE changes for approval. */
const writeTools = [
  {
    name: "create_note",
    description:
      "Propose a NEW note. Does not save directly — the user must approve. Start the content with a '# Title' heading.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title." },
        content: { type: "string", description: "Full markdown body, beginning with '# Title'." },
        folder: { type: "string", description: "Optional folder, e.g. 'Notes' or 'Projects'." },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "edit_note",
    description:
      "Propose replacing an existing note's full content. Does not save directly — the user must approve.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Exact title of the note to edit." },
        content: { type: "string", description: "The complete new markdown body." },
      },
      required: ["title", "content"],
    },
  },
];

const toolsFor = (canWrite: boolean) => (canWrite ? [...tools, ...writeTools] : tools);

/** Keyword-rank notes by title/body overlap with the query. Shared by the search tool and the RAG fallback. */
function rankNotes(v: VaultAccess, query: string, k: number): Note[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  return v.notes
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
    .slice(0, k)
    .map((x) => x.n);
}

function runTool(name: string, input: Record<string, unknown>, v: VaultAccess): string {
  if (name === "search_vault") {
    const hits = rankNotes(v, String(input.query ?? ""), 6);
    if (!hits.length) return "No matching notes.";
    return hits
      .map((n) => `- ${n.title} [${n.folder || "/"}] — ${stripBody(n.content ?? "").slice(0, 160)}`)
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

  if (name === "create_note") {
    if (!v.propose) return "Editing is not enabled.";
    const title = String(input.title ?? "").trim();
    if (!title) return "A title is required.";
    return v.propose({ kind: "create", title, content: String(input.content ?? `# ${title}\n`), folder: String(input.folder ?? "") });
  }

  if (name === "edit_note") {
    if (!v.propose) return "Editing is not enabled.";
    const title = String(input.title ?? "").trim();
    const id = v.resolve(title);
    const note = id ? v.getNote(id) : undefined;
    if (!note) return `Note not found: "${title}".`;
    return v.propose({ kind: "edit", title: note.title, content: String(input.content ?? ""), targetId: note.id });
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
  canWrite?: boolean;
}

/** Anthropic Messages API loop (tool_use / tool_result blocks). */
async function loopAnthropic(o: LoopOpts, system: string): Promise<AgentResult> {
  const api: unknown[] = o.messages.map((m) => ({ role: m.role, content: m.content }));
  // cache the big static system prompt (vault map) so re-sends across the loop & turns bill at ~10%
  const systemBlocks = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
  let tokens = 0;
  for (let i = 0; i < 6; i++) {
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
        body: JSON.stringify({
          model: o.model,
          max_tokens: 1024,
          system: systemBlocks,
          tools: toolsFor(!!o.canWrite),
          messages: api,
        }),
        signal: o.signal,
      },
      o.provider,
      o.onStep,
      o.signal,
    );
    if (!res.ok) throw new Error(`${o.provider.label} ${res.status}: ${await readError(res)}`);
    const data: { content: Block[]; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number } } =
      await res.json();
    tokens += (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
    api.push({ role: "assistant", content: data.content });

    if (data.stop_reason !== "tool_use") {
      const text =
        data.content
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("")
          .trim() || "(no answer)";
      return { text, tokens };
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
  return { text: NO_CONVERGE, tokens };
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
interface OAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * No-tools fallback for models that can't reliably agentic-tool-call (e.g. small Llama on Groq):
 * rank notes locally for the question, stuff the top few in the prompt, ask once. Classic RAG.
 */
async function answerWithContext(o: LoopOpts, headers: Record<string, string>, priorTokens: number): Promise<AgentResult> {
  const question = [...o.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const hits = rankNotes(o.vault, question, 5);
  if (hits.length) o.onStep({ kind: "read", detail: hits.map((n) => n.title).join(", ") });
  const context = hits.length
    ? hits.map((n) => `### ${n.title} [${n.folder || "/"}]\n${(n.content ?? "").slice(0, 2000)}`).join("\n\n---\n\n")
    : "(no clearly relevant notes found)";
  const sys = `You are the research assistant inside Inkwell, a personal knowledge vault. Answer the user's question using ONLY the notes below. Cite each note you use as a [[Note Title]] wikilink. If the notes don't contain the answer, say so plainly.\n\nNOTES:\n${context}`;
  const res = await postWithRetry(
    `${o.provider.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: o.model,
        messages: [{ role: "system", content: sys }, ...o.messages.map((m) => ({ role: m.role, content: m.content }))],
        max_tokens: 1024,
      }),
      signal: o.signal,
    },
    o.provider,
    o.onStep,
    o.signal,
  );
  if (!res.ok) throw new Error(`${o.provider.label} ${res.status}: ${await readError(res)}`);
  const data: { choices: { message: OAIMessage }[]; usage?: OAIUsage } = await res.json();
  return {
    text: (data.choices?.[0]?.message?.content || "").trim() || "(no answer)",
    tokens: priorTokens + (data.usage?.total_tokens ?? 0),
  };
}

const FN_FAIL = /failed.*function|tool[_ ]?use[_ ]?failed|failed_generation|function.*call/i;
// small/cheap models: skip the multi-call tool loop, do one-shot RAG (far fewer tokens, no tool-call flakiness)
const LEAN_MODEL = /(\b\d+b\b|mini|flash-lite|instant|haiku|gemma|1\.5-flash)/i;

/** OpenAI-compatible Chat Completions loop — covers Groq, OpenRouter, OpenAI, etc. */
async function loopOpenAI(o: LoopOpts, system: string): Promise<AgentResult> {
  const oaiTools = toolsFor(!!o.canWrite).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
  const api: unknown[] = [
    { role: "system", content: system },
    ...o.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${o.apiKey || "local"}`,
  };
  if (o.provider.id === "openrouter") {
    headers["HTTP-Referer"] = location.origin;
    headers["X-Title"] = "Inkwell";
  }

  // lean models answer in one shot from locally-retrieved context — cheapest path
  if (LEAN_MODEL.test(o.model)) return answerWithContext(o, headers, 0);

  let tokens = 0;
  for (let i = 0; i < 6; i++) {
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
    if (!res.ok) {
      const detail = await readError(res);
      // some models (small Llama on Groq) fail to emit a valid tool call — fall back to plain RAG
      if (res.status === 400 && FN_FAIL.test(detail)) {
        return answerWithContext(o, headers, tokens);
      }
      throw new Error(`${o.provider.label} ${res.status}: ${detail}`);
    }
    const data: { choices: { message: OAIMessage }[]; usage?: OAIUsage } = await res.json();
    tokens += data.usage?.total_tokens ?? 0;
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
    return { text: (msg.content || "").trim() || "(no answer)", tokens };
  }
  return { text: NO_CONVERGE, tokens };
}

/**
 * Run the vault agent. Emits its navigation steps via onStep, returns the final answer + tokens burned.
 * It loops: model picks tools (search / explore_links / read_notes) → we run them locally →
 * feed results back → repeat until it answers (token-cheap, graph-guided retrieval).
 * Dispatches to the right API dialect for the chosen provider.
 */
export function runVaultAgent(o: LoopOpts): Promise<AgentResult> {
  const system = systemPrompt(o.vault, !!o.canWrite);
  return o.provider.kind === "anthropic" ? loopAnthropic(o, system) : loopOpenAI(o, system);
}
