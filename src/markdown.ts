import { marked } from "marked";
import katex from "katex";

export type Resolver = (title: string) => string | undefined;

function renderKatex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode: display,
      throwOnError: false,
      output: "html",
    });
  } catch {
    return `<code class="math-error">${tex}</code>`;
  }
}

/** Replace $$block$$ and $inline$ math with placeholders, collecting rendered HTML. */
function protectMath(md: string, store: string[]): string {
  let out = md.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
    const i = store.push(renderKatex(tex, true)) - 1;
    return `\n\n<!--MATH:${i}-->\n\n`;
  });
  out = out.replace(/(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_m, tex: string) => {
    const i = store.push(renderKatex(tex, false)) - 1;
    return `<!--MATH:${i}-->`;
  });
  return out;
}

const WIKILINK = /\[\[([^\]]+)\]\]/g;

/** Ordered, unique target note ids referenced by [[wikilinks]] in `md`. */
export function parseWikilinkIds(md: string, resolve: Resolver): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of md.matchAll(WIKILINK)) {
    const title = m[1].split("|")[0];
    const id = resolve(title);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** #tags found in `md` (lowercased, without the #). */
const TAG = /(^|\s)#([a-z0-9](?:[a-z0-9_/-]*[a-z0-9])?)/gi;
export function parseTags(md: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const m of md.matchAll(TAG)) {
    const t = m[2].toLowerCase();
    if (!seen.has(t)) {
      seen.add(t);
      tags.push(t);
    }
  }
  return tags;
}

export interface Task {
  done: boolean;
  text: string;
  line: number;
}

/** Markdown checklist items (`- [ ]` / `- [x]`) with their line index. */
export function parseTasks(md: string): Task[] {
  const out: Task[] = [];
  md.split("\n").forEach((l, i) => {
    const m = l.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (m) out.push({ done: m[1].toLowerCase() === "x", text: m[2].trim(), line: i });
  });
  return out;
}

function expandWikilinks(md: string, resolve: Resolver): string {
  return md.replace(WIKILINK, (_m, inner: string) => {
    const [rawTitle, rawAlias] = inner.split("|");
    const id = resolve(rawTitle);
    const label = (rawAlias ?? rawTitle).trim();
    if (id) return `<a class="wikilink" href="#/note/${id}" data-note="${id}">${label}</a>`;
    return `<span class="wikilink missing">${label}</span>`;
  });
}

export type FrontmatterData = Record<string, string | string[]>;

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

/** Parse a leading YAML-ish frontmatter block (scalars and `- ` lists only). */
export function parseFrontmatter(md: string): { data: FrontmatterData; body: string } {
  const m = md.match(FRONTMATTER);
  if (!m) return { data: {}, body: md };
  const data: FrontmatterData = {};
  let key: string | null = null;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    const item = line.match(/^\s*-\s+(.*)$/);
    if (kv) {
      key = kv[1];
      const val = kv[2].trim();
      data[key] = val === "" ? [] : val;
    } else if (item && key) {
      const cur = data[key];
      data[key] = Array.isArray(cur) ? [...cur, item[1].trim()] : [item[1].trim()];
    }
  }
  return { data, body: md.slice(m[0].length) };
}

export function serializeFrontmatter(data: FrontmatterData): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

/** Set/replace one frontmatter scalar, preserving the body. */
export function setFrontmatterField(md: string, key: string, value: string): string {
  const { data, body } = parseFrontmatter(md);
  const next: FrontmatterData = { ...data, [key]: value };
  return `---\n${serializeFrontmatter(next)}\n---\n\n${body.replace(/^\n+/, "")}`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
}

/** Level 1-3 headings in document order, with [[wikilink]] markup stripped. */
export function parseHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  for (const m of md.matchAll(/^(#{1,3})\s+(.+?)\s*$/gm)) {
    const text = m[2].replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1").replace(/[*_`]/g, "");
    out.push({ level: m[1].length, text, slug: slugify(text) });
  }
  return out;
}

const CALLOUT_ICON: Record<string, string> = {
  note: "📝",
  info: "ℹ️",
  tip: "💡",
  success: "✅",
  question: "❓",
  warning: "⚠️",
  danger: "🔥",
  quote: "❝",
  example: "🧪",
  bug: "🐞",
};

marked.setOptions({ gfm: true, breaks: false });

export interface EmbedSource {
  title: string;
  content: string;
}
export type NoteGetter = (id: string) => EmbedSource | undefined;

export interface CiteEntry {
  id: string;
  label: string;
}
export type CiteResolver = (key: string) => CiteEntry | undefined;

export interface MathRef {
  value: string;
  tex: string;
}
export interface MathCtx {
  symbol: (name: string) => MathRef | undefined;
  scope: Record<string, unknown>;
  /** render a fenced ```math / ```plot block to HTML */
  block: (lang: "math" | "plot", source: string) => string;
}

export interface RenderCtx {
  resolve: Resolver;
  getNote?: NoteGetter;
  cite?: CiteResolver;
  math?: MathCtx;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function katexInline(tex: string): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, output: "html" });
  } catch {
    return tex;
  }
}

const MATH_REF = /\{\{\s*([a-zA-Z_]\w*)\s*(?::(tex|both))?\s*\}\}/g;

/** Inline {{name}} → value, {{name:tex}} → formula, {{name:both}} → formula = value. */
function expandMathRefs(md: string, math?: MathCtx): string {
  if (!math) return md;
  return md.replace(MATH_REF, (_m, name: string, mode?: string) => {
    const sym = math.symbol(name);
    if (!sym) return `<span class="mathref missing">{{${name}}}</span>`;
    if (mode === "tex") return `<span class="mathref">${katexInline(sym.tex)}</span>`;
    if (mode === "both")
      return `<span class="mathref">${katexInline(sym.tex)} = <b>${escapeHtml(sym.value)}</b></span>`;
    return `<span class="mathref" title="${name}">${escapeHtml(sym.value)}</span>`;
  });
}

const CITATION = /\[@([\w:-]+)\]/g;

/** Unique citekeys referenced via [@key] in document order. */
export function parseCitations(md: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of md.matchAll(CITATION)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

function expandCitations(md: string, cite?: CiteResolver): string {
  if (!cite) return md;
  return md.replace(CITATION, (_m, key: string) => {
    const c = cite(key);
    return c
      ? `<a class="cite" data-note="${c.id}" href="#/note/${c.id}">(${c.label})</a>`
      : `(<span class="cite-missing">@${key}</span>)`;
  });
}

const EMBED_LINE = /^!\[\[([^\]]+)\]\]\s*$/gm;

/** The slice of `content` under the heading matching `slug`, up to the next
 * heading of the same or higher level. Whole content if not found. */
function sectionBySlug(content: string, slug: string): string {
  const lines = content.split("\n");
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m && slugify(m[2]) === slug) {
      start = i;
      level = m[1].length;
      break;
    }
  }
  if (start < 0) return content;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

export function renderMarkdown(md: string, ctx: RenderCtx, stack: Set<string> = new Set()): string {
  const { resolve, getNote, cite, math } = ctx;
  const { body } = parseFrontmatter(md);
  // pull KaTeX math out first so $ and \ aren't mangled by markdown
  const katexStore: string[] = [];
  let src = protectMath(body, katexStore);
  // {{name}} engine references
  src = expandMathRefs(src, math);
  // turn `![[Note#Section]]` lines into placeholders before markdown parsing
  const withEmbeds = src.replace(EMBED_LINE, (_m, inner: string) => {
    const [rawTitle, heading] = inner.split("#");
    const id = resolve(rawTitle);
    if (!id || !getNote) return `<span class="wikilink missing">${inner}</span>`;
    return `\n\n<!--EMBED:${id}:${heading ? slugify(heading) : ""}-->\n\n`;
  });

  let html = marked.parse(expandWikilinks(expandCitations(withEmbeds, cite), resolve), {
    async: false,
  }) as string;

  // give headings stable ids so the outline can scroll to them
  html = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_m, lvl, inner) => {
    const text = inner.replace(/<[^>]+>/g, "");
    return `<h${lvl} id="${slugify(text)}">${inner}</h${lvl}>`;
  });

  // mermaid blocks → a host div the ArticleView renders asynchronously
  html = html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_m, code: string) => `<div class="mermaid-src">${code}</div>`,
  );

  // callouts: > [!type] Optional title \n > body…
  html = html.replace(
    /<blockquote>\s*<p>\[!(\w+)\]([\s\S]*?)<\/p>([\s\S]*?)<\/blockquote>/g,
    (_m, type: string, firstPara: string, rest: string) => {
      const t = type.toLowerCase();
      const icon = CALLOUT_ICON[t] ?? "💬";
      const nl = firstPara.indexOf("\n");
      const title = (nl === -1 ? firstPara : firstPara.slice(0, nl)).trim();
      const inlineBody = nl === -1 ? "" : firstPara.slice(nl + 1).trim();
      const head = title || t.charAt(0).toUpperCase() + t.slice(1);
      const body = (inlineBody ? `<p>${inlineBody}</p>` : "") + rest;
      return `<div class="callout callout-${t}"><div class="callout-title"><span class="callout-icon">${icon}</span>${head}</div><div class="callout-body">${body}</div></div>`;
    },
  );

  // live ```math / ```plot fenced blocks
  if (math) {
    html = html.replace(
      /<pre><code class="language-(math|plot)">([\s\S]*?)<\/code><\/pre>/g,
      (_m, lang: "math" | "plot", code: string) => math.block(lang, decodeEntities(code)),
    );
  }

  // expand embed placeholders (marked may wrap them in a <p>)
  html = html.replace(
    /(?:<p>)?<!--EMBED:([^:]+):([^>]*)-->(?:<\/p>)?/g,
    (_m, id: string, headingSlug: string) => {
      const note = getNote?.(id);
      if (!note) return "";
      if (stack.has(id)) return `<div class="embed embed-cycle">↻ ${note.title}</div>`;
      const next = new Set(stack).add(id);
      const inner = renderMarkdown(
        headingSlug ? sectionBySlug(note.content, headingSlug) : note.content,
        ctx,
        next,
      );
      return `<div class="embed"><a class="embed-head" data-note="${id}" href="#/note/${id}">${note.title}</a><div class="embed-body">${inner}</div></div>`;
    },
  );

  // restore rendered KaTeX (block placeholders may be wrapped in a <p>)
  html = html.replace(/(?:<p>)?<!--MATH:(\d+)-->(?:<\/p>)?/g, (_m, i: string) => katexStore[+i] ?? "");

  return html;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
