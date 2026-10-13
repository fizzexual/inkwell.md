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

/** Every folder in the vault (vault-relative, forward slashes), empty ones included. */
export const readVaultDirs = () => invoke<string[]>("read_vault_dirs", {});
/** Make a folder (and missing parents) inside the vault; refuses one that exists. */
export const createFolderOnDisk = (rel: string) => invoke<void>("create_folder", { rel });
/** Rename/move a folder inside the vault; refuses an existing target or moving into itself. */
export const renameFolderOnDisk = (from: string, to: string) => invoke<void>("rename_folder", { from, to });
/** Move a folder, notes and all, to the Recycle Bin. */
export const deleteFolderOnDisk = (rel: string) => invoke<void>("delete_folder", { rel });

export interface BackupInfo {
  name: string;
  /** ms since the epoch */
  time: number;
  /** bytes */
  size: number;
  /** .md files inside */
  notes: number;
}
/** Zip the open vault into the app's backups folder (keeps the newest 14). */
export const backupVault = () => invoke<BackupInfo>("backup_vault", {});
/** The open vault's backups, newest first. */
export const listBackups = () => invoke<BackupInfo[]>("list_backups", {});
/** Extract a backup into a new folder next to the vault; returns that folder's path. */
export const restoreBackup = (name: string) => invoke<string>("restore_backup", { name });
/** Make the folder the last restore created the vault. Returns its path. */
export const openRestoredVault = () => invoke<string | null>("open_restored_vault", {});

// Git history: the repository is always the open vault folder (Rust's own record, never a path from here).
export interface GitInfo {
  /** the vault folder is a git repository */
  repo: boolean;
  /** Inkwell just made it one (false: it already was) */
  created: boolean;
  branch: string | null;
}
export interface GitCommit {
  id: string;
  /** ms since the epoch */
  time: number;
  summary: string;
  author: string;
}
export interface GitCommitted {
  id: string;
  summary: string;
  files: string[];
}
/** Whether the open vault is a git repository, and its branch. */
export const gitInfo = () => invoke<GitInfo>("git_info", {});
/** Make the open vault a git repository if it isn't one (an existing one is used as it is). */
export const gitEnable = () => invoke<GitInfo>("git_enable", {});
/** Commit the vault's changed notes and attachments; null when nothing changed. */
export const gitCommit = () => invoke<GitCommitted | null>("git_commit", {});
/** The commits that changed one note's file, newest first. */
export const gitLog = (rel: string) => invoke<GitCommit[]>("git_log", { rel });
/** A note's text as it was in commit `id`. */
export const gitShow = (rel: string, id: string) => invoke<string>("git_show", { rel, id });

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
