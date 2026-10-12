// Keeps an open on-disk vault in sync: writes changed/new notes to their files and
// removes deleted ones. Only active inside the Tauri desktop app.
import { useVault, onBeforeVaultClose } from "../store/useVault";
import { useHistory } from "../useHistory";
import {
  isTauri,
  pickVault,
  restoreVault,
  readVault,
  writeNoteFile,
  deleteNoteFile,
  renameNoteFile,
  relOf,
  diskNoteToNote,
  watchVault,
  unwatchVault,
  onFsChange,
} from "./disk";
import type { Note } from "../data/vault";
import { noteTitle } from "../data/derive";

type Written = Map<string, { rel: string; content: string }>;

/** note id → the file it lives in, and the content last written to / read from that file. */
let written: Written = new Map();
/** lowercased paths of the .md files known to be on disk (last read + our own writes). */
let onDisk = new Set<string>();
/** the loaded disk vault the baseline above belongs to (null = nothing may be written). */
let syncedPath: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

const lc = (rel: string) => rel.toLowerCase();

// Write-outs and re-reads run one at a time, so a re-read never sees a half-done write-out.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

async function syncNow() {
  const s = useVault.getState();
  if (!s.loadedVault || s.loadedVault !== syncedPath) return;
  const notes = s.notes;
  const live = new Set(notes.map((n) => n.id));
  let failed: string | null = null;

  // files whose notes were deleted — first, so their names are free again
  for (const [id, prev] of [...written]) {
    if (live.has(id)) continue;
    try {
      await deleteNoteFile(prev.rel);
      onDisk.delete(lc(prev.rel));
      written.delete(id);
    } catch (e) {
      console.error("Inkwell: disk delete failed for", prev.rel, e);
    }
  }

  // where every note lives; a note never gets a name some other file on disk already has
  const used = new Set(onDisk);
  for (const w of written.values()) used.add(lc(w.rel));
  for (const note of notes) {
    const prev = written.get(note.id);
    let rel = relOf(note, used, prev?.rel);
    used.add(lc(rel));
    const content = note.content ?? "";
    try {
      if (prev && prev.rel !== rel) {
        // moved to another folder / a new note retitled: rename, never delete + rewrite
        try {
          await renameNoteFile(prev.rel, rel);
          onDisk.delete(lc(prev.rel));
          onDisk.add(lc(rel));
          written.set(note.id, { rel, content: prev.content });
        } catch (e) {
          console.error("Inkwell: couldn't move", prev.rel, "to", rel, e);
          rel = prev.rel; // keep the file where it is, but still save the text
        }
      }
      const cur = written.get(note.id);
      if (!cur || cur.rel !== rel || cur.content !== content) {
        await writeNoteFile(rel, content);
        onDisk.add(lc(rel));
        written.set(note.id, { rel, content });
      }
    } catch (e) {
      // not recorded as written, so the next pass tries again
      console.error("Inkwell: disk write failed for", rel, e);
      failed ??= note.title;
    }
  }
  if (failed) useVault.getState().toast(`Couldn't save “${failed}” to disk — will retry on the next edit`);
}

function scheduleSync() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void serial(syncNow);
  }, 500);
}

/** Write any pending (debounced) edits to disk now. Safe to call any time; no-op without a disk vault. */
export async function flushDiskSync() {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  await serial(syncNow);
}

/** Subscribe once; writes to disk (debounced) whenever notes change while a disk vault is open. */
export function startDiskSync() {
  if (!isTauri()) return;
  useVault.subscribe((s) => {
    // nothing is written until a disk vault has actually been read: before that the notes in
    // memory are the demo vault, which must never land in (or delete from) the user's folder
    if (!s.loadedVault) {
      syncedPath = null;
      return;
    }
    // a freshly (re)loaded vault matches disk already — set the baseline, don't rewrite it
    if (s.loadedVault !== syncedPath) {
      syncedPath = s.loadedVault;
      written = new Map(s.notes.map((n) => [n.id, { rel: n.id, content: n.content ?? "" }]));
      onDisk = new Set(s.notes.map((n) => lc(n.id)));
      return;
    }
    scheduleSync();
  });
  onBeforeVaultClose(flushDiskSync);
}

// ---- external change watching (desktop only) ----
let watchTimer: ReturnType<typeof setTimeout> | undefined;
let reconciling = false;
let again = false;

/** Keep the version of a note another app wrote while the user had unsaved edits to it. */
function keepDiskVersion(note: Note, content: string, extra: Note[]) {
  if (useHistory.getState().record(note.id, content, Date.now())) return;
  // too big for History: keep it as its own note instead, so it is never silently dropped
  extra.push({
    id: `${note.id.replace(/\.md$/i, "")}-disk-version-${Date.now().toString(36)}`,
    title: `${note.title} (disk version)`,
    folder: note.folder,
    kind: note.kind,
    links: [],
    content,
  });
}

/**
 * Re-read the vault from disk and fold in changes made by other apps, without a write-back loop.
 * - disk == what we last wrote/read → our own write (or nothing new): skipped, memory stays.
 * - changed by another app, no unsaved edits here → taken in.
 * - changed by another app while the user has unsaved edits → the user's text is kept (and saved
 *   on the next write-out); the other app's version goes to the note's History.
 */
async function reconcile() {
  const path = syncedPath;
  if (!path) return;
  const disk = await readVault();
  const v = useVault.getState();
  if (v.loadedVault !== path || syncedPath !== path) return; // vault was closed/switched while reading
  const diskByRel = new Map(disk.map((d) => [lc(d.rel), d]));
  onDisk = new Set(diskByRel.keys());
  // every file we wrote or read for a note (incl. ones about to be renamed/deleted) is ours
  const owned = new Set([...written.values()].map((w) => lc(w.rel)));

  let changed = false;
  const conflicts: string[] = [];
  const extra: Note[] = [];
  const next: Note[] = v.notes.map((n) => {
    const w = written.get(n.id);
    const d = w && diskByRel.get(lc(w.rel));
    // not on disk yet (or its file vanished): nothing to compare, and never adopt a file it doesn't own
    if (!w || !d) return n;
    const mem = n.content ?? "";
    if (d.content === w.content) return n;
    if (d.content === mem) {
      written.set(n.id, { rel: w.rel, content: mem });
      return n;
    }
    written.set(n.id, { rel: w.rel, content: d.content });
    if (mem !== w.content) {
      keepDiskVersion(n, d.content, extra);
      conflicts.push(n.title);
      return n;
    }
    changed = true;
    return { ...n, content: d.content, title: noteTitle(d.content) || n.title };
  });
  // files created by another app that we've never seen
  const ids = new Set(next.map((n) => n.id));
  for (const d of disk) {
    if (owned.has(lc(d.rel)) || ids.has(d.rel)) continue;
    changed = true;
    written.set(d.rel, { rel: d.rel, content: d.content });
    next.push(diskNoteToNote(d));
  }
  // NB: deliberately do NOT auto-remove notes whose file vanished — a brand-new in-app note
  // hasn't been flushed to disk yet, and dropping it here would lose unsynced work.
  if (extra.length) {
    changed = true;
    next.push(...extra);
  }
  if (changed) useVault.getState().reconcileDisk(next);
  if (conflicts.length) {
    // the user's text wins on disk at the next write-out; say so, and where the other version is
    scheduleSync();
    useVault
      .getState()
      .toast(
        `“${conflicts.join("”, “")}” changed on disk while you were editing — kept your text; the disk version is in History`,
        undefined,
        { sticky: true },
      );
  } else if (changed) {
    useVault.getState().toast("Vault updated from disk");
  }
}

async function runReconcile() {
  // a change reported while a re-read is running is not dropped: one more pass runs after it
  if (reconciling) {
    again = true;
    return;
  }
  reconciling = true;
  try {
    do {
      again = false;
      await serial(reconcile).catch((e) => console.error("Inkwell: reconcile failed", e));
    } while (again);
  } finally {
    reconciling = false;
  }
}

/**
 * Watch the open vault folder for changes made outside Inkwell (editors, git, Dropbox…) and fold
 * them in live. Starts/stops the native watcher as disk vaults load and close. No-op in the browser.
 */
export function startVaultWatch() {
  if (!isTauri()) return;
  let watched: string | null = null;

  const sync = (path: string | null) => {
    if (path === watched) return;
    watched = path;
    if (path)
      watchVault().catch((e) => {
        watched = null; // let the next load try again
        console.error("Inkwell: watch failed", e);
      });
    else unwatchVault().catch(() => {});
  };

  // debounced reconcile on any batch of filesystem events
  onFsChange(() => {
    if (!useVault.getState().loadedVault) return;
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => void runReconcile(), 350);
  }).catch((e) => console.error("Inkwell: fs listener failed", e));

  // only once the folder has been restored and read — before that Rust has no vault to watch
  sync(useVault.getState().loadedVault);
  useVault.subscribe((s) => sync(s.loadedVault));
}

/** Prompt for a folder, read its .md files, and make it the live vault. */
export async function openVaultFolderFlow() {
  const v = useVault.getState();
  if (!isTauri()) {
    v.toast("On-disk vaults are available in the Inkwell desktop app.");
    return;
  }
  try {
    await flushDiskSync(); // the current vault's last edits, before switching away from it
    const path = await pickVault();
    if (!path) return;
    const disk = await readVault();
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
    // the folder itself comes from Rust's own record, never from localStorage
    const path = await restoreVault();
    if (!path) {
      useVault.setState({ vaultPath: null });
      v.toast("Open your vault folder again (Inkwell now asks once after updating)");
      return;
    }
    const disk = await readVault();
    useVault.getState().loadDiskVault(path, disk.map(diskNoteToNote));
  } catch (e) {
    // folder moved/removed — nothing is written to it; the notes shown are the built-in ones
    console.error("Inkwell: couldn't load the vault folder", e);
    v.toast("Couldn't open your vault folder — showing the built-in notes");
  }
}
