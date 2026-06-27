import { marked } from "marked";

export type Resolver = (title: string) => string | undefined;

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
const TAG = /(^|\s)#([a-z0-9][a-z0-9_-]*)/gi;
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

marked.setOptions({ gfm: true, breaks: false });

export interface EmbedSource {
  title: string;
  content: string;
}
export type NoteGetter = (id: string) => EmbedSource | undefined;

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

export function renderMarkdown(
  md: string,
  resolve: Resolver,
  getNote?: NoteGetter,
  stack: Set<string> = new Set(),
): string {
  const { body } = parseFrontmatter(md);
  // turn `![[Note#Section]]` lines into placeholders before markdown parsing
  const withEmbeds = body.replace(EMBED_LINE, (_m, inner: string) => {
    const [rawTitle, heading] = inner.split("#");
    const id = resolve(rawTitle);
    if (!id || !getNote) return `<span class="wikilink missing">${inner}</span>`;
    return `\n\n<!--EMBED:${id}:${heading ? slugify(heading) : ""}-->\n\n`;
  });

  let html = marked.parse(expandWikilinks(withEmbeds, resolve), { async: false }) as string;

  // give headings stable ids so the outline can scroll to them
  html = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_m, lvl, inner) => {
    const text = inner.replace(/<[^>]+>/g, "");
    return `<h${lvl} id="${slugify(text)}">${inner}</h${lvl}>`;
  });

  // expand embed placeholders (marked may wrap them in a <p>)
  html = html.replace(
    /(?:<p>)?<!--EMBED:([^:]+):([^>]*)-->(?:<\/p>)?/g,
    (_m, id: string, headingSlug: string) => {
      const note = getNote?.(id);
      if (!note) return "";
      if (stack.has(id)) return `<div class="embed embed-cycle">↻ ${note.title}</div>`;
      const next = new Set(stack).add(id);
      const body = headingSlug ? sectionBySlug(note.content, headingSlug) : note.content;
      const inner = renderMarkdown(body, resolve, getNote, next);
      return `<div class="embed"><a class="embed-head" data-note="${id}" href="#/note/${id}">${note.title}</a><div class="embed-body">${inner}</div></div>`;
    },
  );

  return html;
}
