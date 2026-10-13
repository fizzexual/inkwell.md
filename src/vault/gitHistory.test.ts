// @vitest-environment jsdom
// Git history for a disk vault: when commits happen (debounced, on close, "Commit now"), the opt-in
// toggle, and restoring an old version through the normal note update path.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  closeHooks: [] as (() => Promise<void>)[],
  failCommit: null as null | string,
  failEnable: null as null | string,
  created: true,
  changed: true,
  blobs: new Map<string, string>(),
}));

vi.mock("./disk", async (orig) => {
  const actual = await orig<typeof import("./disk")>();
  return {
    ...actual,
    isTauri: () => true,
    gitInfo: async () => ({ repo: true, created: false, branch: "main" }),
    gitEnable: async () => {
      h.calls.push("enable");
      if (h.failEnable) throw h.failEnable;
      return { repo: true, created: h.created, branch: "main" };
    },
    gitCommit: async () => {
      h.calls.push("commit");
      if (h.failCommit) throw h.failCommit;
      return h.changed ? { id: "c1", summary: "Inkwell: 1 note changed", files: ["a.md"] } : null;
    },
    gitLog: async (rel: string) => {
      h.calls.push(`log ${rel}`);
      return [{ id: "c1", time: 1, summary: "Inkwell: 1 note changed", author: "Inkwell" }];
    },
    gitShow: async (rel: string, id: string) => {
      h.calls.push(`show ${rel} ${id}`);
      return h.blobs.get(`${id}:${rel}`) ?? "";
    },
  };
});

vi.mock("./sync", () => ({
  flushDiskSync: async () => void h.calls.push("flush"),
  onAfterCloseFlush: (fn: () => Promise<void>) => void h.closeHooks.push(fn),
  diskRelOf: (id: string) => (id.endsWith(".md") ? id : null),
}));

const note = (id: string, content: string) => ({ id, title: id, folder: "", kind: "note" as const, links: [], content });
const commits = () => h.calls.filter((c) => c === "commit").length;
const close = () => Promise.all(h.closeHooks.map((f) => f()));

async function boot(opts: { on?: boolean } = { on: true }) {
  if (opts.on) localStorage.setItem("inkwell.gitHistory.v1", JSON.stringify(["C:/v"]));
  const { useVault } = await import("../store/useVault");
  const git = await import("./gitHistory");
  git.startGitHistory();
  useVault.getState().loadDiskVault("C:/v", [note("a.md", "# A"), note("b.md", "# B")]);
  await vi.advanceTimersByTimeAsync(0);
  h.calls.length = 0;
  return { useVault, git };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  localStorage.clear();
  h.calls = [];
  h.closeHooks = [];
  h.failCommit = null;
  h.failEnable = null;
  h.created = true;
  h.changed = true;
  h.blobs.clear();
});
afterEach(() => vi.useRealTimers());

describe("automatic commits", () => {
  it("commit 2 minutes after the last change, saving to disk first", async () => {
    const { useVault, git } = await boot();
    useVault.getState().updateContent("a.md", "# A\none");
    await vi.advanceTimersByTimeAsync(git.COMMIT_DELAY - 1000);
    expect(commits()).toBe(0);
    useVault.getState().updateContent("a.md", "# A\ntwo"); // still typing: the wait starts over
    await vi.advanceTimersByTimeAsync(git.COMMIT_DELAY - 1000);
    expect(commits()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.calls).toEqual(["flush", "commit"]);
    // nothing new → no more commits
    await vi.advanceTimersByTimeAsync(git.COMMIT_DELAY * 3);
    expect(commits()).toBe(1);
  });

  it("never commits a vault that has git history off", async () => {
    const { useVault, git } = await boot({ on: false });
    useVault.getState().updateContent("a.md", "# A\none");
    await vi.advanceTimersByTimeAsync(git.COMMIT_DELAY * 2);
    await close();
    expect(commits()).toBe(0);
  });

  it("closing commits pending changes at once, and nothing when there are none", async () => {
    const { useVault } = await boot();
    await close();
    expect(commits()).toBe(0);
    useVault.getState().updateContent("a.md", "# A\none");
    await close();
    expect(h.calls).toEqual(["flush", "commit"]);
    // the debounced commit doesn't fire again afterwards
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(commits()).toBe(1);
  });

  it("a failed commit warns once and is retried on the next change or close", async () => {
    const { useVault, git } = await boot();
    h.failCommit = "index.lock exists";
    useVault.getState().updateContent("a.md", "# A\none");
    await vi.advanceTimersByTimeAsync(git.COMMIT_DELAY);
    useVault.getState().updateContent("a.md", "# A\ntwo");
    await vi.advanceTimersByTimeAsync(git.COMMIT_DELAY);
    const warnings = useVault.getState().toasts.filter((t) => /Git commit failed/.test(t.message));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/index\.lock exists/);
    h.failCommit = null;
    await close();
    expect(commits()).toBe(3);
  });

  it("switching to another vault drops the old vault's pending commit", async () => {
    const { useVault, git } = await boot();
    useVault.getState().updateContent("a.md", "# A\none");
    useVault.getState().loadDiskVault("C:/other", [note("c.md", "# C")]);
    await vi.advanceTimersByTimeAsync(git.COMMIT_DELAY * 2);
    await close();
    expect(commits()).toBe(0);
  });
});

describe("the toggle and Commit now", () => {
  it("turning it on makes the repo, remembers the vault, and commits what is there", async () => {
    const { useVault, git } = await boot({ on: false });
    await git.setGitHistoryFlow(true);
    expect(h.calls).toEqual(["flush", "enable", "flush", "commit"]);
    expect(git.gitHistoryOn()).toBe(true);
    expect(JSON.parse(localStorage.getItem("inkwell.gitHistory.v1")!)).toEqual(["C:/v"]);
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/now a git repository/);
  });

  it("an existing repository is used, and the toast says so", async () => {
    const { useVault, git } = await boot({ on: false });
    h.created = false;
    await git.setGitHistoryFlow(true);
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/existing git repository.*main/);
  });

  it("a refused enable leaves it off", async () => {
    const { useVault, git } = await boot({ on: false });
    h.failEnable = "This folder is inside another git repository";
    await git.setGitHistoryFlow(true);
    expect(git.gitHistoryOn()).toBe(false);
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/Couldn't turn on git history.*inside another/);
  });

  it("turning it off stops commits but keeps the repository", async () => {
    const { useVault, git } = await boot();
    useVault.getState().updateContent("a.md", "# A\none");
    await git.setGitHistoryFlow(false);
    expect(git.gitHistoryOn()).toBe(false);
    await vi.advanceTimersByTimeAsync(git.COMMIT_DELAY * 2);
    await close();
    expect(commits()).toBe(0);
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/stay in the folder/);
  });

  it("Commit now saves first and says what was committed, or that nothing changed", async () => {
    const { useVault, git } = await boot();
    await git.commitNowFlow();
    expect(h.calls).toEqual(["flush", "commit"]);
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/Committed.*1 note changed/);
    h.changed = false;
    await git.commitNowFlow();
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/Nothing to commit/);
  });
});

describe("restoring a git version", () => {
  it("goes through the store's note update (so undo and disk sync see it)", async () => {
    const { useVault, git } = await boot();
    const { useHistory } = await import("../useHistory");
    h.blobs.set("c1:a.md", "# A\nold text");
    const spy = vi.spyOn(useVault.getState(), "updateContent");
    await git.restoreGitVersion("a.md", "c1");
    expect(spy).toHaveBeenCalledWith("a.md", "# A\nold text");
    expect(useVault.getState().notesById.get("a.md")?.content).toBe("# A\nold text");
    // the text it replaced is kept as a local snapshot, and undo brings it back
    expect(useHistory.getState().versions["a.md"]?.[0]?.content).toBe("# A");
    useVault.getState().undo();
    expect(useVault.getState().notesById.get("a.md")?.content).toBe("# A");
  });

  it("the log and versions are asked for by the note's file on disk", async () => {
    const { git } = await boot();
    expect(await git.gitLogFor("a.md")).toHaveLength(1);
    expect(h.calls).toEqual(["log a.md"]);
    await expect(git.gitLogFor("new-unsaved")).resolves.toBeNull();
  });
});
