import type { Note } from "./vault";
import {
  parseWikilinkTitles,
  resolveLinkTitles,
  parseFrontmatter,
  parseCitations,
  parseTags,
  type FrontmatterData,
  type Resolver,
} from "../markdown";

/** What the vault-wide derived data needs from one note's text. */
export interface NoteFacts {
  /** titles its [[wikilinks]] point at, in order (unresolved) */
  linkTitles: string[];
  tags: string[];
  frontmatter: FrontmatterData;
  aliases: string[];
}

// Parsed once per note object. Notes are never changed in place (an edit makes a new object and
// keeps every other note's object), so a rebuild after a keystroke re-parses only the edited note.
const factsCache = new WeakMap<Note, NoteFacts>();

export function noteFacts(note: Note): NoteFacts {
  let f = factsCache.get(note);
  if (!f) {
    const md = note.content ?? "";
    const frontmatter = parseFrontmatter(md).data;
    const a = frontmatter.aliases;
    f = {
      linkTitles: parseWikilinkTitles(md),
      tags: parseTags(md),
      frontmatter,
      aliases: Array.isArray(a) ? a.map(String) : a ? [String(a)] : [],
    };
    factsCache.set(note, f);
  }
  return f;
}

const escBib = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface Citation {
  id: string;
  key: string;
  label: string;
  authors: string;
  year: string;
  title: string;
  venue: string;
}

/** citekey → citation metadata, gathered from source-note frontmatter. */
export function buildCiteMap(notes: Note[]): Map<string, Citation> {
  const map = new Map<string, Citation>();
  for (const n of notes) {
    const fm = noteFacts(n).frontmatter;
    const key = typeof fm.citekey === "string" ? fm.citekey : "";
    if (!key) continue;
    const authors = Array.isArray(fm.authors) ? fm.authors.join(", ") : String(fm.authors ?? "");
    const year = String(fm.year ?? "");
    map.set(key, {
      id: n.id,
      key,
      label: [authors || n.title, year].filter(Boolean).join(", "),
      authors,
      year,
      title: n.title,
      venue: Array.isArray(fm.venue) ? fm.venue.join(", ") : String(fm.venue ?? ""),
    });
  }
  return map;
}

export function toBibtex(c: Citation): string {
  const fields = [
    `  title = {${c.title}}`,
    c.authors && `  author = {${c.authors}}`,
    c.year && `  year = {${c.year}}`,
    c.venue && `  booktitle = {${c.venue}}`,
  ].filter(Boolean);
  return `@inproceedings{${c.key},\n${fields.join(",\n")}\n}`;
}

/** Render a note's cited works ([@key]) as a formatted, alphabetized reference list (HTML). */
export function buildBibliography(md: string, citeMap: Map<string, Citation>): string {
  const cites = parseCitations(md)
    .map((k) => citeMap.get(k))
    .filter((c): c is Citation => !!c)
    .sort((a, b) => (a.authors || a.title).localeCompare(b.authors || b.title));
  if (!cites.length)
    return `<div class="bib bib-empty">No citations yet — reference a source with <code>[@citekey]</code> and it appears here.</div>`;
  const items = cites
    .map((c) => {
      const who = escBib(c.authors || c.title);
      const yr = c.year ? ` (${escBib(c.year)})` : "";
      const venue = c.venue ? ` <em>${escBib(c.venue)}</em>.` : "";
      return `<li><span class="bib-who">${who}</span>${yr}. <a class="wikilink" data-note="${c.id}" href="#/note/${c.id}">${escBib(c.title)}</a>.${venue}</li>`;
    })
    .join("");
  return `<div class="bib"><ol class="bib-list">${items}</ol></div>`;
}

/** A note as the folder tree shows it — no content, so a tree kept across keystrokes is never stale. */
export type TreeNote = Pick<Note, "id" | "title" | "folder" | "kind">;

export interface TreeFolder {
  type: "folder";
  name: string;
  path: string;
  folders: TreeFolder[];
  notes: TreeNote[];
}

/** A note's title: its first `# ` heading, ignoring frontmatter and fenced code (a `# comment` there). */
export function noteTitle(md: string): string | undefined {
  const body = md
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, "")
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, "");
  return body.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() || undefined;
}

/** aliases declared in a note's frontmatter. */
export function aliasesOf(note: Note): string[] {
  return noteFacts(note).aliases;
}

/**
 * Map of note title + aliases (lowercased) → id, for resolving [[wikilinks]].
 * Two notes with the same title: the first one in the vault keeps it (stable, never last-wins).
 */
export function titleResolver(notes: Note[]): Resolver {
  const map = new Map<string, string>();
  for (const n of notes) {
    const key = n.title.toLowerCase();
    if (!map.has(key)) map.set(key, n.id);
  }
  // aliases fill gaps but never override a real title
  for (const n of notes) {
    for (const alias of aliasesOf(n)) {
      const key = alias.trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, n.id);
    }
  }
  return (title) => map.get(title.trim().toLowerCase());
}

/** The ordered unique ids `note` links to (never itself; only ids `exists` knows). */
export function noteLinks(note: Note, resolve: Resolver, exists: (id: string) => boolean): string[] {
  return resolveLinkTitles(noteFacts(note).linkTitles, resolve).filter((id) => id !== note.id && exists(id));
}

/** id → ordered unique target ids, parsed from each note's content. */
export function buildLinkMap(notes: Note[], resolve: Resolver): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const valid = new Set(notes.map((n) => n.id));
  const exists = (id: string) => valid.has(id);
  for (const note of notes) out.set(note.id, noteLinks(note, resolve, exists));
  return out;
}

/** tag → how many notes carry it. */
export function buildTagCounts(notes: Note[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of notes) for (const t of noteFacts(n).tags) out.set(t, (out.get(t) ?? 0) + 1);
  return out;
}

/** Build a nested folder tree from the flat note list. */
export function buildTree(notes: Note[], vaultName: string): TreeFolder {
  const root: TreeFolder = { type: "folder", name: vaultName, path: "", folders: [], notes: [] };

  const folderFor = (path: string): TreeFolder => {
    if (path === "") return root;
    const parts = path.split("/");
    let cur = root;
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let next = cur.folders.find((f) => f.path === acc);
      if (!next) {
        next = { type: "folder", name: part, path: acc, folders: [], notes: [] };
        cur.folders.push(next);
      }
      cur = next;
    }
    return cur;
  };

  for (const { id, title, folder, kind } of notes) folderFor(folder).notes.push({ id, title, folder, kind });

  const sortFolder = (f: TreeFolder) => {
    f.folders.sort((a, b) => a.name.localeCompare(b.name));
    f.notes.sort((a, b) => a.title.localeCompare(b.title));
    f.folders.forEach(sortFolder);
  };
  sortFolder(root);
  return root;
}

export interface GraphNode {
  id: string;
  title: string;
  degree: number;
  kind: Note["kind"];
  folder: string;
}
export interface GraphEdge {
  source: string;
  target: string;
}

export function buildGraph(
  notes: Note[],
  linkMap: Map<string, string[]>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  const order = new Map(notes.map((n, i) => [n.id, i]));

  notes.forEach((note, i) => {
    for (const target of linkMap.get(note.id) ?? []) {
      // A→B and B→A are one edge, kept where it's first met: the earlier note's list
      const j = order.get(target);
      if (j !== undefined && j < i && linkMap.get(target)?.includes(note.id)) continue;
      edges.push({ source: note.id, target });
      bump(note.id);
      bump(target);
    }
  });

  const nodes: GraphNode[] = notes.map((nt) => ({
    id: nt.id,
    title: nt.title,
    degree: degree.get(nt.id) ?? 0,
    kind: nt.kind,
    folder: nt.folder,
  }));

  return { nodes, edges };
}

/** id → ids of notes that link to it. */
export function buildBacklinks(linkMap: Map<string, string[]>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [from, targets] of linkMap) {
    for (const to of targets) {
      const arr = out.get(to) ?? [];
      arr.push(from);
      out.set(to, arr);
    }
  }
  return out;
}
