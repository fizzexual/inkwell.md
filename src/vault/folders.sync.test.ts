// @vitest-environment jsdom
// Folder operations in an on-disk vault, against a fake folder that behaves like NTFS
// (case-insensitive names, folders exist on their own). The sync engine must never re-write,
// rename or delete note files itself after a folder was renamed/moved/deleted by Rust.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  files: new Map<string, { rel: string; content: string }>(), // key: lowercased rel
  dirs: new Map<string, string>(), // lowercased → as created
  calls: [] as string[],
  rootSet: false,
  fsCb: null as null | ((paths: string[]) => void),
  failNext: null as null | string,
}));

vi.mock("./disk", async (orig) => {
  const actual = await orig<typeof import("./disk")>();
  const k = (rel: string) => rel.toLowerCase();
  const inside = (p: string, dir: string) => k(p) === k(dir) || k(p).startsWith(k(dir) + "/");
  const needRoot = () => {
    if (!h.rootSet) throw new Error("No vault folder is open");
  };
  const refuse = () => {
    if (h.failNext) {
      const m = h.failNext;
      h.failNext = null;
      throw m; // Tauri rejects with the Rust error string
    }
  };
  return {
    ...actual,
    isTauri: () => true,
    pickVault: async () => ((h.rootSet = true), "C:/vault"),
    restoreVault: async () => ((h.rootSet = true), "C:/vault"),
    closeVaultFolder: async () => {
      h.rootSet = false;
    },
    readVault: async () => (needRoot(), [...h.files.values()].map((f) => ({ ...f }))),
    readVaultDirs: async () => (needRoot(), [...h.dirs.values()]),
    writeNoteFile: async (rel: string, content: string) => {
      needRoot();
      h.calls.push(`write ${rel}`);
      const prev = h.files.get(k(rel));
      h.files.set(k(rel), { rel: prev?.rel ?? rel, content });
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
      h.files.delete(k(from));
      h.files.set(k(to), { rel: to, content: src.content });
    },
    createFolderOnDisk: async (rel: string) => {
      needRoot();
      h.calls.push(`mkdir ${rel}`);
      refuse();
      if (h.dirs.has(k(rel))) throw `A folder or file named ${rel} already exists`;
      h.dirs.set(k(rel), rel);
    },
    renameFolderOnDisk: async (from: string, to: string) => {
      needRoot();
      h.calls.push(`mvdir ${from} ${to}`);
      refuse();
      if (h.dirs.has(k(to))) throw `A folder or file named ${to} already exists`;
      const move = (p: string) => (inside(p, from) ? to + p.slice(from.length) : p);
      for (const [key, f] of [...h.files]) {
        if (!inside(f.rel, from)) continue;
        h.files.delete(key);
        h.files.set(k(move(f.rel)), { rel: move(f.rel), content: f.content });
      }
      for (const [key, d] of [...h.dirs]) {
        if (!inside(d, from)) continue;
        h.dirs.delete(key);
        h.dirs.set(k(move(d)), move(d));
      }
    },
    deleteFolderOnDisk: async (rel: string) => {
      needRoot();
      h.calls.push(`rmdir ${rel}`);
      refuse();
      for (const [key, f] of [...h.files]) if (inside(f.rel, rel)) h.files.delete(key);
      for (const [key, d] of [...h.dirs]) if (inside(d, rel)) h.dirs.delete(key);
    },
    watchVault: async () => {},
    unwatchVault: async () => {},
    onFsChange: async (cb: (paths: string[]) => void) => {
      h.fsCb = cb;
      return () => {};
    },
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {} }),
}));

function seedDisk(files: Record<string, string>, dirs: string[] = []) {
  for (const [rel, content] of Object.entries(files)) {
    h.files.set(rel.toLowerCase(), { rel, content });
    const parts = rel.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const d = parts.slice(0, i).join("/");
      h.dirs.set(d.toLowerCase(), d);
    }
  }
  for (const d of dirs) h.dirs.set(d.toLowerCase(), d);
}
const disk = (rel: string) => h.files.get(rel.toLowerCase())?.content;
/** the file operations the sync engine itself made (not the folder commands) */
const noteWrites = () => h.calls.filter((c) => /^(write|delete|rename) /.test(c));

async function openVault(files: Record<string, string>, dirs: string[] = []) {
  seedDisk(files, dirs);
  const { useVault } = await import("../store/useVault");
  const { withFolders } = await import("../folders");
  const sync = await import("./sync");
  sync.startDiskSync();
  sync.startVaultWatch();
  await sync.openVaultFolderFlow();
  await vi.advanceTimersByTimeAsync(0);
  h.calls.length = 0;
  const folderPaths = () => {
    const s = useVault.getState();
    const out: string[] = [];
    const walk = (f: ReturnType<typeof withFolders>) =>
      f.folders.forEach((c) => {
        out.push(c.path);
        walk(c);
      });
    walk(withFolders(s.tree, s.folders));
    return out.sort();
  };
  return { useVault, sync, folderPaths };
}

async function fsEvent(...paths: string[]) {
  h.fsCb?.(paths);
  await vi.advanceTimersByTimeAsync(400);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  localStorage.clear();
  h.files.clear();
  h.dirs.clear();
  h.calls.length = 0;
  h.rootSet = false;
  h.fsCb = null;
  h.failNext = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("empty folders on disk", () => {
  it("show in the sidebar when the vault opens", async () => {
    const { folderPaths } = await openVault({ "a.md": "# A\n" }, ["Empty", "Empty/Deeper"]);
    expect(folderPaths()).toEqual(["Empty", "Empty/Deeper"]);
  });

  it("a new folder is made on disk and shows while empty", async () => {
    const { sync, folderPaths } = await openVault({ "a.md": "# A\n" });
    expect(await sync.createFolderFlow("Projects/2026")).toBeNull();
    expect(h.calls).toEqual(["mkdir Projects/2026"]);
    expect(folderPaths()).toEqual(["Projects", "Projects/2026"]);
  });

  it("a folder Rust refuses to make is not shown", async () => {
    const { sync, folderPaths } = await openVault({ "a.md": "# A\n" });
    h.failNext = "Path leaves the vault";
    expect(await sync.createFolderFlow("X")).toMatch(/leaves the vault/);
    expect(folderPaths()).toEqual([]);
  });
});

describe("renaming / moving a folder on disk", () => {
  it("moves the folder in one step: no note file is re-written, renamed or deleted", async () => {
    const { useVault, sync, folderPaths } = await openVault(
      { "A/n.md": "# N\n\nbody", "A/sub/m.md": "# M\n", "linker.md": "# Linker\n\n[[N]] and [[M]]" },
      ["A/empty"],
    );
    expect(await sync.renameFolderFlow("A", "Archive/A")).toBeNull();
    expect(h.calls).toEqual(["mvdir A Archive/A"]);
    expect(disk("Archive/A/n.md")).toBe("# N\n\nbody");
    expect(folderPaths()).toEqual(["Archive", "Archive/A", "Archive/A/empty", "Archive/A/sub"]);
    // the sync engine and the watcher's re-read leave the moved files alone, and add no ghosts
    await vi.advanceTimersByTimeAsync(2000);
    await fsEvent("Archive/A/n.md", "A/n.md");
    expect(noteWrites()).toEqual([]);
    expect(useVault.getState().notes).toHaveLength(3);
    // [[links]] into the moved folder still resolve
    expect(useVault.getState().linksOf("linker.md").map((n) => n.title).sort()).toEqual(["M", "N"]);
    // and later edits to a moved note go to its new file
    useVault.getState().updateContent("A/n.md", "# N\n\nedited after the move");
    await vi.advanceTimersByTimeAsync(600);
    expect(noteWrites()).toEqual(["write Archive/A/n.md"]);
    expect(disk("Archive/A/n.md")).toBe("# N\n\nedited after the move");
    expect([...h.files.keys()].some((k) => k.startsWith("a/"))).toBe(false);
  });

  it("an edit still inside the save delay lands before the folder moves", async () => {
    const { useVault, sync } = await openVault({ "A/n.md": "# N\n\nv1" });
    useVault.getState().updateContent("A/n.md", "# N\n\nv2 typed just now");
    expect(await sync.renameFolderFlow("A", "B")).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toEqual(["write A/n.md", "mvdir A B"]);
    expect(disk("B/n.md")).toBe("# N\n\nv2 typed just now");
  });

  it("a new note not yet saved moves with its folder and is saved there", async () => {
    const { useVault, sync } = await openVault({ "A/n.md": "# N\n" });
    useVault.getState().createNoteWith("Fresh", "# Fresh\n", "A");
    expect(await sync.renameFolderFlow("A", "B")).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(disk("B/fresh.md")).toBe("# Fresh\n");
    expect([...h.files.keys()].sort()).toEqual(["b/fresh.md", "b/n.md"]);
  });

  it("when Rust refuses (target exists), nothing changes in the app or on disk", async () => {
    const { useVault, sync } = await openVault({ "A/n.md": "# N\n", "B/o.md": "# O\n" });
    expect(await sync.renameFolderFlow("A", "B")).toMatch(/exists/); // caught before Rust
    expect(h.calls).toEqual([]);
    h.failNext = "Access is denied. (os error 5)";
    expect(await sync.renameFolderFlow("A", "C")).toMatch(/denied/);
    expect(useVault.getState().notesById.get("A/n.md")!.folder).toBe("A");
    await vi.advanceTimersByTimeAsync(2000);
    expect(noteWrites()).toEqual([]);
    expect(disk("A/n.md")).toBe("# N\n");
  });

  it("refuses moving a folder into itself without calling Rust", async () => {
    const { sync } = await openVault({ "A/sub/n.md": "# N\n" });
    expect(await sync.renameFolderFlow("A", "A/sub/A")).toMatch(/itself/);
    expect(h.calls).toEqual([]);
  });
});

describe("deleting a folder on disk", () => {
  it("sends it to the Recycle Bin in one step and drops its notes from the app", async () => {
    const { useVault, sync, folderPaths } = await openVault({
      "Old/a.md": "# A\n",
      "Old/deep/b.md": "# B\n",
      "keep.md": "# Keep\n",
    });
    expect(await sync.deleteFolderFlow("Old")).toBeNull();
    expect(h.calls).toEqual(["rmdir Old"]);
    expect(useVault.getState().notes.map((n) => n.id)).toEqual(["keep.md"]);
    expect(folderPaths()).toEqual([]);
    const t = useVault.getState().toasts.at(-1)!;
    expect(t.message).toMatch(/Recycle Bin/);
    await vi.advanceTimersByTimeAsync(2000);
    await fsEvent("Old/a.md");
    expect(noteWrites()).toEqual([]);
    expect(disk("keep.md")).toBe("# Keep\n");
  });

  it("when Rust refuses, the notes stay", async () => {
    const { useVault, sync } = await openVault({ "Old/a.md": "# A\n" });
    h.failNext = "The file is open in another program";
    expect(await sync.deleteFolderFlow("Old")).toMatch(/another program/);
    expect(useVault.getState().notesById.has("Old/a.md")).toBe(true);
  });
});
