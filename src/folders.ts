import type { TreeFolder } from "./data/derive";

export const FOLDER_PALETTE = [
  "#6d4bd0",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#0ea5e9",
  "#84cc16",
  "#a855f7",
  "#64748b",
];

export function topFolder(folder: string): string {
  return folder ? folder.split("/")[0] : "Vault root";
}

/** Deterministic top-folder → colour map (sorted so it's stable). */
export function buildFolderColors(folders: string[]): Map<string, string> {
  const tops = [...new Set(folders.map(topFolder))].sort();
  const map = new Map<string, string>();
  tops.forEach((t, i) => map.set(t, FOLDER_PALETTE[i % FOLDER_PALETTE.length]));
  return map;
}

/** The vault's display name: the open folder's name, else the built-in vault's name. */
export function vaultName(vaultPath: string | null | undefined, fallback: string): string {
  return (vaultPath && vaultPath.split(/[\\/]/).filter(Boolean).pop()) || fallback;
}

/** True when `path` is `folder` itself or anywhere inside it. */
export function isInFolder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder + "/");
}

/** `path` with its leading `from` folder swapped for `to` (unchanged when it isn't inside `from`). */
export function rebaseFolder(path: string, from: string, to: string): string {
  return isInFolder(path, from) ? to + path.slice(from.length) : path;
}

/** Every folder path that exists: notes' folders, the explicit (possibly empty) ones, and their parents. */
export function allFolderPaths(noteFolders: string[], folders: string[]): Set<string> {
  const out = new Set<string>();
  for (const f of [...noteFolders, ...folders]) {
    if (!f) continue;
    const parts = f.split("/");
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join("/"));
  }
  return out;
}

// what Windows refuses in a file/folder name (and `/` separates folders here)
const BAD_CHARS = /[\\:*?"<>|\u0000-\u001f]/;

/** Why `path` (`A` or `A/B`) can't be a folder name, or null when it can. */
export function folderNameError(path: string): string | null {
  if (!path.trim()) return "Type a folder name";
  if (BAD_CHARS.test(path)) return 'A folder name can\'t contain \\ : * ? " < > |';
  for (const part of path.split("/")) {
    if (!part.trim()) return "A folder name can't be empty";
    if (part.startsWith(".")) return "A folder name can't start with a dot";
    if (/[. ]$/.test(part)) return "A folder name can't end with a dot or a space";
  }
  return null;
}

/** Why a new folder `path` can't be made among `all` existing folder paths, or null. */
export function folderAddError(all: Set<string>, path: string): string | null {
  const bad = folderNameError(path);
  if (bad) return bad;
  if ([...all].some((p) => p.toLowerCase() === path.toLowerCase())) return `A folder named “${path}” already exists`;
  return null;
}

/** Why folder `from` can't be renamed/moved to `to` among `all` existing folder paths, or null. */
export function folderMoveError(all: Set<string>, from: string, to: string): string | null {
  const bad = folderNameError(to);
  if (bad) return bad;
  if (!from || !all.has(from)) return `There is no folder “${from}”`;
  const [f, t] = [from.toLowerCase(), to.toLowerCase()];
  if (t === f) return null; // the same folder, or a case-only rename
  if (isInFolder(t, f)) return "A folder can't be moved into itself";
  if ([...all].some((p) => p.toLowerCase() === t)) return `A folder named “${to}” already exists`;
  return null;
}

/** `parent/New folder`, `parent/New folder 2`… — the first one not taken (case-insensitively). */
export function freeFolderName(all: Set<string>, parent: string, base = "New folder"): string {
  const taken = new Set([...all].map((p) => p.toLowerCase()));
  const at = (name: string) => (parent ? `${parent}/${name}` : name);
  let path = at(base);
  for (let i = 2; taken.has(path.toLowerCase()); i++) path = at(`${base} ${i}`);
  return path;
}

/** The note tree plus the explicit folders that hold no notes yet (a new tree; the input is untouched). */
export function withFolders(tree: TreeFolder, folders: string[]): TreeFolder {
  if (!folders.length) return tree;
  const clone = (f: TreeFolder): TreeFolder => ({ ...f, folders: f.folders.map(clone) });
  const root = clone(tree);
  const added = new Set<TreeFolder>();
  for (const path of folders) {
    let cur = root;
    let acc = "";
    for (const part of path.split("/").filter(Boolean)) {
      acc = acc ? `${acc}/${part}` : part;
      let next = cur.folders.find((f) => f.path === acc);
      if (!next) {
        next = { type: "folder", name: part, path: acc, folders: [], notes: [] };
        cur.folders.push(next);
        added.add(cur);
      }
      cur = next;
    }
  }
  for (const f of added) f.folders.sort((a, b) => a.name.localeCompare(b.name));
  return root;
}
