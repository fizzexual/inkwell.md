// Keeps an open on-disk vault in sync: writes changed/new notes to their files and
// removes deleted ones. Only active inside the Tauri desktop app.
import { useVault } from "../store/useVault";
import { isTauri, pickFolder, readVault, writeNoteFile, deleteNoteFile, relOf, diskNoteToNote } from "./disk";
import type { Note } from "../data/vault";

type Written = Map<string, { rel: string; content: string }>;

let written: Written = new Map();
let lastPath: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

async function syncNow(path: string, notes: Note[]) {
  const used = new Set<string>();
  const next: Written = new Map();
  const currentIds = new Set(notes.map((n) => n.id));

  for (const note of notes) {
    const rel = relOf(note, used);
    used.add(rel);
    const content = note.content ?? "";
    const prev = written.get(note.id);
    next.set(note.id, { rel, content });
    try {
      if (!prev || prev.content !== content || prev.rel !== rel) {
        await writeNoteFile(path, rel, content);
        if (prev && prev.rel !== rel) await deleteNoteFile(path, prev.rel); // file moved
      }
    } catch (e) {
      console.error("Inkwell: disk write failed for", rel, e);
    }
  }
  // files whose notes were deleted
  for (const [id, prev] of written) {
    if (!currentIds.has(id)) {
      try {
        await deleteNoteFile(path, prev.rel);
      } catch {
        /* already gone */
      }
    }
  }
  written = next;
}

/** Subscribe once; writes to disk (debounced) whenever notes change while a disk vault is open. */
export function startDiskSync() {
  if (!isTauri()) return;
  useVault.subscribe((s) => {
    if (!s.vaultPath) return;
    // a freshly (re)loaded vault matches disk already — set the baseline, don't rewrite it
    if (s.vaultPath !== lastPath) {
      lastPath = s.vaultPath;
      written = new Map(s.notes.map((n) => [n.id, { rel: n.id, content: n.content ?? "" }]));
      return;
    }
    if (timer) clearTimeout(timer);
    const path = s.vaultPath;
    timer = setTimeout(() => syncNow(path, useVault.getState().notes), 500);
  });
}

/** Prompt for a folder, read its .md files, and make it the live vault. */
export async function openVaultFolderFlow() {
  const v = useVault.getState();
  if (!isTauri()) {
    v.toast("On-disk vaults are available in the Inkwell desktop app.");
    return;
  }
  try {
    const path = await pickFolder();
    if (!path) return;
    const disk = await readVault(path);
    v.loadDiskVault(path, disk.map(diskNoteToNote));
    v.toast(`Opened vault · ${disk.length} note${disk.length === 1 ? "" : "s"}`);
  } catch (e) {
    v.toast("Couldn't open that folder");
    console.error(e);
  }
}

/** On launch, re-open the last disk vault if there was one. */
export async function autoloadVault() {
  const v = useVault.getState();
  if (!isTauri() || !v.vaultPath) return;
  try {
    const disk = await readVault(v.vaultPath);
    v.loadDiskVault(v.vaultPath, disk.map(diskNoteToNote));
  } catch {
    /* folder moved/removed — fall back to whatever is loaded */
  }
}
