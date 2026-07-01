// Keeps an open on-disk vault in sync: writes changed/new notes to their files and
// removes deleted ones. Only active inside the Tauri desktop app.
import { useVault } from "../store/useVault";
import {
  isTauri,
  pickFolder,
  readVault,
  writeNoteFile,
  deleteNoteFile,
  relOf,
  diskNoteToNote,
  watchVault,
  unwatchVault,
  onFsChange,
} from "./disk";
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

// ---- external change watching (desktop only) ----
let watchTimer: ReturnType<typeof setTimeout> | undefined;
let reconciling = false;

/** Re-read the vault from disk and fold in any changes made by other apps, without a write-back loop. */
async function reconcile(path: string) {
  if (reconciling) return;
  reconciling = true;
  try {
    const disk = await readVault(path);
    const v = useVault.getState();
    if (v.vaultPath !== path) return; // vault was closed/switched while reading
    const diskByRel = new Map(disk.map((d) => [d.rel, d.content]));

    // the on-disk path each current note maps to (same ordering syncNow uses)
    const used = new Set<string>();
    const relById = new Map<string, string>();
    for (const n of v.notes) {
      const rel = relOf(n, used);
      used.add(rel);
      relById.set(n.id, rel);
    }

    let changed = false;
    const seen = new Set<string>();
    const next: Note[] = v.notes.map((n) => {
      const rel = relById.get(n.id)!;
      seen.add(rel);
      const dc = diskByRel.get(rel);
      if (dc !== undefined && dc !== (n.content ?? "")) {
        changed = true;
        const heading = dc.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
        return { ...n, content: dc, title: heading || n.title };
      }
      return n;
    });
    // files created by another app that we've never seen
    for (const d of disk) {
      if (!seen.has(d.rel)) {
        changed = true;
        next.push(diskNoteToNote(d));
      }
    }
    // NB: deliberately do NOT auto-remove notes whose file vanished — a brand-new in-app note
    // hasn't been flushed to disk yet, and dropping it here would lose unsynced work.
    if (!changed) return;

    // reset the write baseline to exactly the reconciled state so the sync pass writes nothing back
    const used2 = new Set<string>();
    written = new Map();
    for (const n of next) {
      const rel = relOf(n, used2);
      used2.add(rel);
      written.set(n.id, { rel, content: n.content ?? "" });
    }
    useVault.getState().reconcileDisk(next);
    useVault.getState().toast("Vault updated from disk");
  } catch (e) {
    console.error("Inkwell: reconcile failed", e);
  } finally {
    reconciling = false;
  }
}

/**
 * Watch the open vault folder for changes made outside Inkwell (editors, git, Dropbox…) and fold
 * them in live. Starts/stops the native watcher as vaults open and close. No-op in the browser.
 */
export function startVaultWatch() {
  if (!isTauri()) return;
  let watched: string | null = null;

  const sync = (path: string | null) => {
    if (path === watched) return;
    watched = path;
    if (path) watchVault(path).catch((e) => console.error("Inkwell: watch failed", e));
    else unwatchVault().catch(() => {});
  };

  // debounced reconcile on any batch of filesystem events
  onFsChange(() => {
    const path = useVault.getState().vaultPath;
    if (!path) return;
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => reconcile(path), 350);
  }).catch((e) => console.error("Inkwell: fs listener failed", e));

  sync(useVault.getState().vaultPath);
  useVault.subscribe((s) => sync(s.vaultPath));
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
