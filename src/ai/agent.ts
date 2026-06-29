import type { Note } from "../data/vault";
import { parseTags } from "../markdown";

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
  kind: "search" | "links" | "read";
  detail: string;
}

export const AI_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 · balanced" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 · fastest" },
  { id: "claude-opus-4-8", label: "Opus 4.8 · deepest" },
];

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
    const titles = Array.isArray(input.titles) ? (input.titles as unknown[]).map(String) : [];
    if (!titles.length) return "No titles given.";
    return titles
      .map((t) => {
        const id = v.resolve(t);
        const note = id ? v.getNote(id) : undefined;
        if (!note) return `### ${t}\n(not found)`;
        const body = (note.content ?? "").slice(0, 6000);
        return `### ${note.title}\n${body}`;
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

async function callApi(
  apiKey: string,
  model: string,
  system: string,
  messages: unknown[],
  signal?: AbortSignal,
): Promise<{ content: Block[]; stop_reason: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: 2048, system, tools, messages }),
    signal,
  });
  if (!res.ok) {
    let detail = await res.text();
    try {
      detail = JSON.parse(detail).error?.message ?? detail;
    } catch {
      /* keep raw text */
    }
    throw new Error(`Anthropic API ${res.status}: ${detail}`);
  }
  return res.json();
}

const textOf = (blocks: Block[]) =>
  blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();

/**
 * Run the vault agent. Streams its navigation steps via onStep, returns the final answer text.
 * It loops: model picks tools (search / explore_links / read_notes) → we run them locally →
 * feed results back → repeat until it produces a final answer (token-cheap, graph-guided retrieval).
 */
export async function runVaultAgent(opts: {
  apiKey: string;
  model: string;
  messages: ChatMsg[];
  vault: VaultAccess;
  onStep: (s: AgentStep) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { apiKey, model, messages, vault, onStep, signal } = opts;
  const system = systemPrompt(vault);
  const api: unknown[] = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let i = 0; i < 8; i++) {
    const data = await callApi(apiKey, model, system, api, signal);
    api.push({ role: "assistant", content: data.content });

    if (data.stop_reason !== "tool_use") {
      return textOf(data.content) || "(no answer)";
    }

    const results: unknown[] = [];
    for (const block of data.content) {
      if (block.type !== "tool_use" || !block.name) continue;
      const input = block.input ?? {};
      if (block.name === "search_vault") onStep({ kind: "search", detail: String(input.query ?? "") });
      else if (block.name === "explore_links") onStep({ kind: "links", detail: String(input.title ?? "") });
      else if (block.name === "read_notes")
        onStep({ kind: "read", detail: (Array.isArray(input.titles) ? input.titles : []).map(String).join(", ") });
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: runTool(block.name, input, vault),
      });
    }
    api.push({ role: "user", content: results });
  }

  return "I looked through several notes but couldn't converge — try narrowing the question.";
}
