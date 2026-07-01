// Bridge to the Rust filesystem commands for on-disk vaults.
// All calls are guarded by isTauri() so the browser/dev build silently no-ops.
import type { Note } from "../data/vault";

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

/** Native folder picker. Returns the chosen absolute path, or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const res = await open({ directory: true, multiple: false, title: "Open a vault folder" });
  return typeof res === "string" ? res : null;
}

export const readVault = (path: string) => invoke<DiskNote[]>("read_vault", { path });
export const writeNoteFile = (path: string, rel: string, content: string) =>
  invoke<void>("write_note", { path, rel, content });
export const deleteNoteFile = (path: string, rel: string) => invoke<void>("delete_note", { path, rel });

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

/** A DiskNote → an Inkwell Note. id IS the file's relative path; folder is its directory. */
export function diskNoteToNote(d: DiskNote): Note {
  const slash = d.rel.lastIndexOf("/");
  const folder = slash >= 0 ? d.rel.slice(0, slash) : "";
  const base = (slash >= 0 ? d.rel.slice(slash + 1) : d.rel).replace(/\.md$/i, "");
  const heading = d.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return {
    id: d.rel,
    title: heading || base,
    folder,
    kind: "note",
    links: [],
    content: d.content,
  };
}

/** The on-disk relative path a note should live at. */
export function relOf(note: Note, used: Set<string>): string {
  // notes loaded from disk keep their original file path (stable across heading edits)
  if (/\.md$/i.test(note.id)) return note.id;
  // new notes: <folder>/<slug(title)>.md, de-duplicated within the folder
  const dir = note.folder ? note.folder + "/" : "";
  let rel = `${dir}${slugify(note.title || "untitled")}.md`;
  for (let i = 1; used.has(rel); i++) rel = `${dir}${slugify(note.title || "untitled")}-${i}.md`;
  return rel;
}
