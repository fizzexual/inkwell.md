import type { Note, VaultData } from "./vault";

export interface TreeFolder {
  type: "folder";
  name: string;
  path: string;
  folders: TreeFolder[];
  notes: Note[];
}

/** Build a nested folder tree from the flat note list. */
export function buildTree(vault: VaultData): TreeFolder {
  const root: TreeFolder = { type: "folder", name: vault.name, path: "", folders: [], notes: [] };

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

  for (const note of vault.notes) folderFor(note.folder).notes.push(note);

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
}
export interface GraphEdge {
  source: string;
  target: string;
}

export function buildGraph(vault: VaultData): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byId = new Map(vault.notes.map((nt) => [nt.id, nt]));
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();

  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  for (const note of vault.notes) {
    for (const target of note.links) {
      if (!byId.has(target) || target === note.id) continue;
      const key = [note.id, target].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: note.id, target });
      bump(note.id);
      bump(target);
    }
  }

  const nodes: GraphNode[] = vault.notes.map((nt) => ({
    id: nt.id,
    title: nt.title,
    degree: degree.get(nt.id) ?? 0,
    kind: nt.kind,
  }));

  return { nodes, edges };
}

/** Notes that link TO the given id. */
export function backlinksOf(vault: VaultData, id: string): Note[] {
  return vault.notes.filter((nt) => nt.id !== id && nt.links.includes(id));
}

/** Resolve a note's outgoing links to Note objects (skipping dangling ids). */
export function linksOf(vault: VaultData, note: Note): Note[] {
  const byId = new Map(vault.notes.map((nt) => [nt.id, nt]));
  return note.links.map((l) => byId.get(l)).filter((x): x is Note => !!x);
}
