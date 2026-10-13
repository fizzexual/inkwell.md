// Optional git history for a disk vault (desktop only). Per vault, opt-in from the vault menu: the
// vault folder becomes (or already is) a git repository, and Inkwell commits its notes and
// attachments there — 2 minutes after the last change, when the window or vault closes, and on
// "Commit now". Rust owns the repository (always the open vault folder) and never pushes or pulls.
import { create } from "zustand";
import { useVault } from "../store/useVault";
import { useHistory } from "../useHistory";
import { isTauri, gitInfo, gitEnable, gitCommit, gitLog, gitShow, type GitInfo, type GitCommit } from "./disk";
import { flushDiskSync, onAfterCloseFlush, diskRelOf } from "./sync";

/** Commit this long after the last change. */
export const COMMIT_DELAY = 120_000;
const KEY = "inkwell.gitHistory.v1";

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

interface GitState {
  /** vault folders with git history on */
  vaults: string[];
  /** the open vault's repository, while git history is on for it */
  info: GitInfo | null;
}

export const useGitHistory = create<GitState>(() => ({ vaults: load(), info: null }));

function setVaults(vaults: string[]) {
  useGitHistory.setState({ vaults });
  try {
    localStorage.setItem(KEY, JSON.stringify(vaults));
  } catch {
    /* storage full: it stays on until reload */
  }
}

/** Whether git history is on for `path` (default: the open disk vault). */
export function gitHistoryOn(path = useVault.getState().loadedVault): boolean {
  return !!path && useGitHistory.getState().vaults.includes(path);
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---- when to commit ----
let timer: ReturnType<typeof setTimeout> | undefined;
/** the vault with changes not yet committed (null = nothing pending) */
let pendingVault: string | null = null;
let warned = false;
let queue: Promise<unknown> = Promise.resolve();

function cancel() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  pendingVault = null;
}

/** Save to disk, then commit — one at a time. Returns the commit (null: nothing changed). */
function commit() {
  const run = queue.then(async () => {
    await flushDiskSync();
    return gitCommit();
  });
  queue = run.catch(() => {});
  return run;
}

/** Commit the pending changes, if any and the vault they belong to is still the open one. */
async function commitPending() {
  const vault = pendingVault;
  cancel();
  if (!vault || vault !== useVault.getState().loadedVault || !gitHistoryOn(vault)) return;
  try {
    await commit();
    warned = false;
  } catch (e) {
    pendingVault ??= vault; // kept, so the next change or close tries again
    console.error("Inkwell: git commit failed", e);
    if (!warned) {
      warned = true;
      useVault.getState().toast(`Git commit failed: ${errText(e)} — will retry on the next change`);
    }
  }
}

function changed(vault: string) {
  if (!gitHistoryOn(vault)) return;
  pendingVault = vault;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void commitPending(), COMMIT_DELAY);
}

async function loadInfo(vault: string) {
  try {
    const info = await gitInfo();
    if (useVault.getState().loadedVault === vault) useGitHistory.setState({ info });
  } catch (e) {
    console.error("Inkwell: couldn't read the vault's git status", e);
  }
}

/** Subscribe once: commits (debounced) while a disk vault with git history on is edited. No-op in the browser. */
export function startGitHistory() {
  if (!isTauri()) return;
  useVault.subscribe((s, prev) => {
    if (s.loadedVault !== prev.loadedVault) {
      cancel(); // a switched/closed vault's pending commit is dropped; Rust commits what changed next time
      useGitHistory.setState({ info: null });
      if (s.loadedVault && gitHistoryOn(s.loadedVault)) void loadInfo(s.loadedVault);
      return;
    }
    if (s.loadedVault && s.notes !== prev.notes) changed(s.loadedVault);
  });
  onAfterCloseFlush(commitPending);
}

// ---- the vault menu ----

/** Turn git history on or off for the open disk vault. Off keeps the repository and its commits. */
export async function setGitHistoryFlow(on: boolean) {
  const v = useVault.getState();
  const vault = v.loadedVault;
  if (!vault) return;
  if (!on) {
    cancel();
    setVaults(useGitHistory.getState().vaults.filter((p) => p !== vault));
    useGitHistory.setState({ info: null });
    v.toast("Git history off — the repository and its commits stay in the folder");
    return;
  }
  let info: GitInfo;
  try {
    await flushDiskSync();
    info = await gitEnable();
  } catch (e) {
    v.toast(`Couldn't turn on git history: ${errText(e)}`);
    return;
  }
  setVaults([...useGitHistory.getState().vaults.filter((p) => p !== vault), vault]);
  useGitHistory.setState({ info });
  let first = "";
  try {
    await commit(); // what is there now is the first version
  } catch (e) {
    pendingVault = vault; // retried on the next change or close
    first = ` — the first commit failed: ${errText(e)}`;
  }
  v.toast(
    (info.created
      ? "Git history on — this vault is now a git repository; changes are committed 2 minutes after you stop editing"
      : `Git history on — using the existing git repository${info.branch ? ` (branch ${info.branch})` : ""}`) + first,
  );
}

/** "Commit now": save, commit, and say what happened. */
export async function commitNowFlow() {
  const v = useVault.getState();
  const vault = v.loadedVault;
  if (!vault || !gitHistoryOn(vault)) return;
  cancel();
  try {
    const c = await commit();
    warned = false;
    v.toast(c ? `Committed · ${c.summary.replace(/^Inkwell: /, "")}` : "Nothing to commit — the vault matches the last commit");
  } catch (e) {
    pendingVault = vault;
    v.toast(`Git commit failed: ${errText(e)}`);
  }
}

// ---- History: one note's commits ----

/** The commits that changed this note's file, newest first; null when the note isn't on disk yet. */
export async function gitLogFor(noteId: string): Promise<GitCommit[] | null> {
  const rel = diskRelOf(noteId);
  return rel ? gitLog(rel) : null;
}

/** The note's text as it was in commit `id`. */
export async function gitVersionOf(noteId: string, id: string): Promise<string> {
  const rel = diskRelOf(noteId);
  if (!rel) throw new Error("This note isn't saved to disk yet");
  return gitShow(rel, id);
}

/**
 * Put the note back to how it was in commit `id`, through the normal note update (so undo, the disk
 * sync and the next commit all see it). The text it replaces is kept as a local History snapshot.
 */
export async function restoreGitVersion(noteId: string, id: string) {
  const text = await gitVersionOf(noteId, id);
  const v = useVault.getState();
  const current = v.notesById.get(noteId)?.content ?? "";
  useHistory.getState().record(noteId, current, Date.now());
  v.updateContent(noteId, text);
}
