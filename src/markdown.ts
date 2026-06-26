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

export function renderMarkdown(md: string, resolve: Resolver): string {
  const html = marked.parse(expandWikilinks(md, resolve), { async: false }) as string;
  // give headings stable ids so the outline can scroll to them
  return html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_m, lvl, inner) => {
    const text = inner.replace(/<[^>]+>/g, "");
    return `<h${lvl} id="${slugify(text)}">${inner}</h${lvl}>`;
  });
}
