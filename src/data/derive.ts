import type { Note } from "./vault";
import { parseWikilinkIds, parseFrontmatter, type Resolver } from "../markdown";

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
    const fm = parseFrontmatter(n.content ?? "").data;
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

export interface TreeFolder {
  type: "folder";
  name: string;
  path: string;
  folders: TreeFolder[];
  notes: Note[];
}

/** Map of note title (lowercased) → id, for resolving [[wikilinks]]. */
export function titleResolver(notes: Note[]): Resolver {
  const map = new Map(notes.map((n) => [n.title.toLowerCase(), n.id]));
  return (title) => map.get(title.trim().toLowerCase());
}

/** id → ordered unique target ids, parsed from each note's content. */
export function buildLinkMap(notes: Note[], resolve: Resolver): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const valid = new Set(notes.map((n) => n.id));
  for (const note of notes) {
    const ids = parseWikilinkIds(note.content ?? "", resolve).filter(
      (id) => id !== note.id && valid.has(id),
    );
    out.set(note.id, ids);
  }
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

  for (const note of notes) folderFor(note.folder).notes.push(note);

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
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  for (const note of notes) {
    for (const target of linkMap.get(note.id) ?? []) {
      const key = [note.id, target].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: note.id, target });
      bump(note.id);
      bump(target);
    }
  }

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
