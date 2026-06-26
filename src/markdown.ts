import { marked } from "marked";
import { vault } from "./data/vault";

const titleToId = new Map(vault.notes.map((n) => [n.title.toLowerCase(), n.id]));

export function resolveNoteId(title: string): string | undefined {
  return titleToId.get(title.trim().toLowerCase());
}

// Turn [[Title]] / [[Title|alias]] into anchors the ArticleView can intercept.
function expandWikilinks(md: string): string {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    const [rawTitle, rawAlias] = inner.split("|");
    const id = resolveNoteId(rawTitle);
    const label = (rawAlias ?? rawTitle).trim();
    if (id) return `<a class="wikilink" href="#/note/${id}" data-note="${id}">${label}</a>`;
    return `<span class="wikilink missing">${label}</span>`;
  });
}

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(md: string): string {
  return marked.parse(expandWikilinks(md), { async: false }) as string;
}
