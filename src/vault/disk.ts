// Bridge to the Rust filesystem commands for on-disk vaults.
// All calls are guarded by isTauri() so the browser/dev build silently no-ops.
import type { Note } from "../data/vault";
import { noteTitle } from "../data/derive";

interface DiskNote {
  rel: string;
  content: string;
}

/** True only inside the packaged Tauri desktop app (not the browser dev preview). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// The vault folder lives on the Rust side: JS can pick one (native dialog run by Rust) or restore
// the last one, but can never point the file commands at an arbitrary path.

/** Native folder picker; makes the chosen folder the vault. Returns its path, or null if cancelled. */
export const pickVault = () => invoke<string | null>("pick_vault", {});
/** Re-open the vault folder Rust saved last time. Returns its path, or null if there is none. */
export const restoreVault = () => invoke<string | null>("restore_vault", {});
/** Forget the vault folder. */
export const closeVaultFolder = () => invoke<void>("close_vault", {});

export const readVault = () => invoke<DiskNote[]>("read_vault", {});
export const writeNoteFile = (rel: string, content: string) => invoke<void>("write_note", { rel, content });
export const deleteNoteFile = (rel: string) => invoke<void>("delete_note", { rel });
/** Move/rename a note file inside the vault; refuses to replace an existing file. */
export const renameNoteFile = (from: string, to: string) => invoke<void>("rename_note", { from, to });

/** Start the native filesystem watcher on the open vault folder (replaces any previous watch). */
export const watchVault = () => invoke<void>("watch_vault", {});
/** Stop watching the current vault folder. */
export const unwatchVault = () => invoke<void>("unwatch_vault", {});

/** Subscribe to native "a .md file changed on disk" events. Returns an unlisten function. */
export async function onFsChange(cb: (paths: string[]) => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string[]>("vault-fs-change", (e) => cb(e.payload ?? []));
}

// names Windows reserves for devices: `con.md` can't be created there
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A file-name-safe slug: letters/digits in any script; everything else (incl. `<>:"/\|?*`) → `-`. */
function slugify(s: string): string {
  const slug =
    s
      .normalize("NFC")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "untitled";
  return RESERVED.test(slug) ? `${slug}_` : slug;
}

/** A DiskNote → an Inkwell Note. id IS the file's relative path; folder is its directory. */
export function diskNoteToNote(d: DiskNote): Note {
  const slash = d.rel.lastIndexOf("/");
  const folder = slash >= 0 ? d.rel.slice(0, slash) : "";
  const base = (slash >= 0 ? d.rel.slice(slash + 1) : d.rel).replace(/\.md$/i, "");
  const heading = noteTitle(d.content);
  return {
    id: d.rel,
    title: heading || base,
    folder,
    kind: "note",
    links: [],
    content: d.content,
  };
}

/**
 * The on-disk relative path a note should live at. `used` holds the lowercased paths already taken
 * (files on disk + paths handed out this pass): names compare case-insensitively, as NTFS/APFS do,
 * so a new "Ideas" never lands on an existing "Ideas.md". `own` is the file the note already has.
 */
export function relOf(note: Note, used: Set<string>, own?: string): string {
  // notes loaded from disk keep their original file name (stable across heading edits);
  // new notes: <folder>/<slug(title)>.md, de-duplicated within the folder
  const md = /\.md$/i.test(note.id);
  const base = md
    ? note.id.slice(note.id.lastIndexOf("/") + 1).replace(/\.md$/i, "")
    : slugify(note.title || "untitled");
  const dir = note.folder ? note.folder + "/" : "";
  const free = (rel: string) => !used.has(rel.toLowerCase()) || rel.toLowerCase() === own?.toLowerCase();
  let rel = `${dir}${base}.md`;
  for (let i = 1; !free(rel); i++) rel = `${dir}${base}-${i}.md`;
  return rel;
}
