// @vitest-environment jsdom
// The disk sync engine against a fake vault folder that behaves like NTFS (case-insensitive names).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  files: new Map<string, { rel: string; content: string }>(), // key: lowercased rel
  calls: [] as string[],
  rootSet: false,
  fsCb: null as null | ((paths: string[]) => void),
  readGate: null as null | Promise<void>,
  closeHandler: null as null | (() => Promise<void>),
}));

vi.mock("./disk", async (orig) => {
  const actual = await orig<typeof import("./disk")>();
  const k = (rel: string) => rel.toLowerCase();
  const needRoot = () => {
    if (!h.rootSet) throw new Error("No vault folder is open");
  };
  return {
    ...actual,
    isTauri: () => true,
    pickVault: async () => ((h.rootSet = true), "C:/vault"),
    restoreVault: async () => ((h.rootSet = true), "C:/vault"),
    closeVaultFolder: async () => {
      h.rootSet = false;
    },
    readVault: async () => {
      needRoot();
      const snapshot = [...h.files.values()].map((f) => ({ ...f })); // what the folder held when asked
      if (h.readGate) await h.readGate;
      return snapshot;
    },
    writeNoteFile: async (rel: string, content: string) => {
      needRoot();
      h.calls.push(`write ${rel}`);
      const prev = h.files.get(k(rel));
      h.files.set(k(rel), { rel: prev?.rel ?? rel, content }); // NTFS keeps the existing name's case
    },
    deleteNoteFile: async (rel: string) => {
      needRoot();
      h.calls.push(`delete ${rel}`);
      h.files.delete(k(rel));
    },
    renameNoteFile: async (from: string, to: string) => {
      needRoot();
      h.calls.push(`rename ${from} ${to}`);
      const src = h.files.get(k(from));
      if (!src) throw new Error("missing " + from);
      if (h.files.has(k(to)) && k(to) !== k(from)) throw new Error(`A file named ${to} already exists`);
      h.files.delete(k(from));
      h.files.set(k(to), { rel: to, content: src.content });
    },
    watchVault: async () => {
      needRoot();
      h.calls.push("watch");
    },
    unwatchVault: async () => {
      h.calls.push("unwatch");
    },
    onFsChange: async (cb: (paths: string[]) => void) => {
      h.fsCb = cb;
      return () => {};
    },
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (fn: () => Promise<void>) => {
      h.closeHandler = fn;
      return () => {};
    },
  }),
}));

function seedDisk(files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) h.files.set(rel.toLowerCase(), { rel, content });
}
const disk = (rel: string) => h.files.get(rel.toLowerCase())?.content;
const writes = () => h.calls.filter((c) => c.startsWith("write") || c.startsWith("delete") || c.startsWith("rename"));

async function boot(opts: { persistedVault?: boolean } = {}) {
  if (opts.persistedVault) localStorage.setItem("inkwell.vault.v2", JSON.stringify({ vaultPath: "C:/vault" }));
  const { useVault } = await import("../store/useVault");
  const { useHistory } = await import("../useHistory");
  const sync = await import("./sync");
  sync.startDiskSync();
  sync.startVaultWatch();
  await vi.advanceTimersByTimeAsync(0);
  return { useVault, useHistory, sync };
}

async function openVault(files: Record<string, string>) {
  seedDisk(files);
  const env = await boot();
  await env.sync.openVaultFolderFlow();
  await vi.advanceTimersByTimeAsync(0);
  h.calls.length = 0;
  return env;
}

/** the native watcher reports a change, then the debounced re-read runs */
async function fsEvent(...paths: string[]) {
  h.fsCb?.(paths);
  await vi.advanceTimersByTimeAsync(400);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  localStorage.clear();
  h.files.clear();
  h.calls.length = 0;
  h.rootSet = false;
  h.fsCb = null;
  h.readGate = null;
  h.closeHandler = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("startup (bug 12)", () => {
  it("never writes the demo notes into the folder while the disk vault is still loading", async () => {
    seedDisk({ "real.md": "# Real\n" });
    let release!: () => void;
    h.readGate = new Promise((r) => (release = r));
    const { useVault, sync } = await boot({ persistedVault: true });
    const loading = sync.autoloadVault();
    // the user clicks around in the (demo) notes shown before the disk read returns
    const demo = useVault.getState().notes[0];
    useVault.getState().updateContent(demo.id, "# typed before load\n");
    useVault.getState().togglePin(demo.id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(writes()).toEqual([]);
    release();
    await loading;
    await vi.advanceTimersByTimeAsync(2000);
    expect(writes()).toEqual([]);
    expect(useVault.getState().notes.map((n) => n.id)).toEqual(["real.md"]);
    expect([...h.files.keys()]).toEqual(["real.md"]);
    // and once loaded, edits do sync
    useVault.getState().updateContent("real.md", "# Real\n\nedited");
    await vi.advanceTimersByTimeAsync(600);
    expect(disk("real.md")).toBe("# Real\n\nedited");
  });

  it("starts the folder watcher only after the vault folder is restored and read", async () => {
    seedDisk({ "real.md": "# Real\n" });
    const { sync } = await boot({ persistedVault: true });
    expect(h.calls).not.toContain("watch");
    await sync.autoloadVault();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toContain("watch");
  });
});

describe("watcher re-read (bug 1)", () => {
  it("the echo of our own save never overwrites text typed after it", async () => {
    const { useVault } = await openVault({ "a.md": "# A\n\nv1" });
    useVault.getState().updateContent("a.md", "# A\n\nv2");
    await vi.advanceTimersByTimeAsync(600); // v2 saved
    expect(disk("a.md")).toBe("# A\n\nv2");
    useVault.getState().updateContent("a.md", "# A\n\nv2 and more"); // typing continues
    await fsEvent("a.md"); // the watcher reports our v2 write
    expect(useVault.getState().notesById.get("a.md")!.content).toBe("# A\n\nv2 and more");
    expect(useVault.getState().toasts.map((t) => t.message)).not.toContain("Vault updated from disk");
    await vi.advanceTimersByTimeAsync(600);
    expect(disk("a.md")).toBe("# A\n\nv2 and more");
  });

  it("an outside edit is taken in when there are no unsaved edits, without a write-back", async () => {
    const { useVault } = await openVault({ "a.md": "# A\n\nv1" });
    seedDisk({ "a.md": "# A\n\nfrom another app" });
    await fsEvent("a.md");
    expect(useVault.getState().notesById.get("a.md")!.content).toBe("# A\n\nfrom another app");
    await vi.advanceTimersByTimeAsync(2000);
    expect(writes()).toEqual([]);
  });

  it("an outside edit during unsaved typing keeps the user's text and saves the disk version in History", async () => {
    const { useVault, useHistory } = await openVault({ "a.md": "# A\n\nv1" });
    useVault.getState().updateContent("a.md", "# A\n\nmine");
    seedDisk({ "a.md": "# A\n\ntheirs" });
    await fsEvent("a.md");
    expect(useVault.getState().notesById.get("a.md")!.content).toBe("# A\n\nmine");
    expect(useHistory.getState().versions["a.md"]?.[0]?.content).toBe("# A\n\ntheirs");
    const msg = useVault.getState().toasts.map((t) => t.message).join("\n");
    expect(msg).toMatch(/changed on disk/i);
    await vi.advanceTimersByTimeAsync(600);
    expect(disk("a.md")).toBe("# A\n\nmine");
  });

  it("a new note whose heading changed is not re-added as a ghost duplicate", async () => {
    const { useVault } = await openVault({ "a.md": "# A\n" });
    useVault.getState().createNote();
    const id = useVault.getState().selectedId;
    await vi.advanceTimersByTimeAsync(600);
    expect(disk("untitled-note.md")).toBeDefined();
    useVault.getState().updateContent(id, "# Meeting\n");
    await fsEvent("untitled-note.md"); // before the next write-out
    expect(useVault.getState().notes).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(600);
    await fsEvent("meeting.md", "untitled-note.md");
    expect(useVault.getState().notes).toHaveLength(2);
    expect(Object.keys(Object.fromEntries(h.files)).sort()).toEqual(["a.md", "meeting.md"]);
  });

  it("changes reported while a re-read is running are picked up afterwards (bug 13)", async () => {
    const { useVault } = await openVault({ "a.md": "# A\n", "b.md": "# B\n" });
    let release!: () => void;
    h.readGate = new Promise((r) => (release = r));
    seedDisk({ "a.md": "# A\n\nouter 1" });
    await fsEvent("a.md"); // re-read #1 starts, sees outer 1, waits
    h.readGate = null;
    seedDisk({ "b.md": "# B\n\nouter 2" });
    await fsEvent("b.md"); // arrives while #1 is running
    release();
    await vi.advanceTimersByTimeAsync(400);
    expect(useVault.getState().notesById.get("a.md")!.content).toBe("# A\n\nouter 1");
    expect(useVault.getState().notesById.get("b.md")!.content).toBe("# B\n\nouter 2");
  });
});

describe("new-note file names (bug 2)", () => {
  it("a new note never overwrites an existing file that differs only by case", async () => {
    const { useVault } = await openVault({ "Ideas.md": "# Ideas\n\nprecious" });
    useVault.getState().createNoteWith("Ideas", "# Ideas\n\nnew one");
    await vi.advanceTimersByTimeAsync(600);
    expect(disk("Ideas.md")).toBe("# Ideas\n\nprecious");
    expect(disk("ideas-1.md")).toBe("# Ideas\n\nnew one");
    // and deleting the new note later removes only its own file
    const id = useVault.getState().notes.find((n) => n.content === "# Ideas\n\nnew one")!.id;
    useVault.getState().deleteNote(id);
    await vi.advanceTimersByTimeAsync(600);
    expect(disk("Ideas.md")).toBe("# Ideas\n\nprecious");
  });

  it("deleting a note and creating one with the same name at once keeps the new note's file", async () => {
    const { useVault } = await openVault({ "a.md": "# A\n" });
    seedDisk({ "plan.md": "# Plan\n\nwritten elsewhere" });
    await fsEvent("plan.md");
    useVault.getState().deleteNote("plan.md"); // the user removes it from the list…
    useVault.getState().createNoteWith("Plan", "# Plan\n\nmine"); // …and writes a new Plan at once
    await vi.advanceTimersByTimeAsync(600);
    expect(disk("plan-1.md") ?? disk("plan.md")).toBeDefined();
    expect(Object.values(Object.fromEntries(h.files)).map((f) => f.content)).toContain("# Plan\n\nmine");
  });
});

describe("moving a disk note (bug 6)", () => {
  it("moves the file on disk, keeps links, and leaves no ghost", async () => {
    const { useVault } = await openVault({ "a/n.md": "# N\n\nbody", "linker.md": "# Linker\n\n[[N]]" });
    useVault.getState().moveNote("a/n.md", "b");
    await vi.advanceTimersByTimeAsync(600);
    expect(disk("b/n.md")).toBe("# N\n\nbody");
    expect(disk("a/n.md")).toBeUndefined();
    expect(writes()).toEqual(["rename a/n.md b/n.md"]); // a move, not delete + rewrite
    expect(useVault.getState().linksOf("linker.md").map((n) => n.title)).toEqual(["N"]);
    await fsEvent("a/n.md", "b/n.md");
    expect(useVault.getState().notes).toHaveLength(2);
  });

  it("never moves onto a file that already exists in the target folder", async () => {
    const { useVault } = await openVault({ "a/n.md": "# N\n\nmine", "b/n.md": "# Other N\n\nkeep me" });
    useVault.getState().moveNote("a/n.md", "b");
    await vi.advanceTimersByTimeAsync(600);
    expect(disk("b/n.md")).toBe("# Other N\n\nkeep me");
    expect(disk("b/n-1.md")).toBe("# N\n\nmine");
  });
});

describe("closing (bug 5)", () => {
  it("closing the window saves edits still inside the 500ms debounce", async () => {
    const { useVault } = await openVault({ "a.md": "# A\n" });
    useVault.getState().updateContent("a.md", "# A\n\nlast words");
    expect(h.closeHandler).toBeTypeOf("function");
    await h.closeHandler!(); // Alt+F4 / the close button: Tauri awaits this, then destroys the window
    expect(disk("a.md")).toBe("# A\n\nlast words");
  });

  it("closing the vault saves pending edits before forgetting the folder", async () => {
    const { useVault } = await openVault({ "a.md": "# A\n" });
    useVault.getState().updateContent("a.md", "# A\n\nbefore close");
    await useVault.getState().closeVault();
    expect(disk("a.md")).toBe("# A\n\nbefore close");
  });

  it("close hooks (git history's last commit) run after the edits reach disk, on window and vault close", async () => {
    const { useVault, sync } = await openVault({ "a.md": "# A\n" });
    const seen: string[] = [];
    sync.onAfterCloseFlush(async () => void seen.push(disk("a.md") ?? "missing"));
    useVault.getState().updateContent("a.md", "# A\n\none");
    await h.closeHandler!();
    expect(seen).toEqual(["# A\n\none"]);
    useVault.getState().updateContent("a.md", "# A\n\ntwo");
    await useVault.getState().closeVault();
    expect(seen).toEqual(["# A\n\none", "# A\n\ntwo"]);
  });

  it("a failing or stuck close hook never holds the close", async () => {
    const { sync } = await openVault({ "a.md": "# A\n" });
    sync.onAfterCloseFlush(async () => {
      throw new Error("git broke");
    });
    sync.onAfterCloseFlush(() => new Promise<void>(() => {})); // never settles
    const closing = sync.flushOnClose();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(closing).resolves.toBeUndefined();
  });
});
