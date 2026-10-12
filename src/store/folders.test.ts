// @vitest-environment jsdom
// Folder management in the browser (demo) vault: empty folders, rename/move, delete + undo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withFolders, folderNameError } from "../folders";
import type { TreeFolder } from "../data/derive";

const tick = () => new Promise((r) => setTimeout(r, 0));

async function load() {
  vi.resetModules();
  const { useVault } = await import("./useVault");
  return useVault;
}

/** every folder path in a tree, depth-first */
function paths(t: TreeFolder): string[] {
  return t.folders.flatMap((f) => [f.path, ...paths(f)]);
}
const treeOf = (s: { tree: TreeFolder; folders: string[] }) => withFolders(s.tree, s.folders);

async function setup() {
  const useVault = await load();
  useVault.getState().importNotes([
    { title: "Target", content: "# Target\n\nbody", folder: "Projects/Alpha" },
    { title: "Top", content: "# Top\n", folder: "Projects" },
    { title: "Linker", content: "# Linker\n\nsee [[Target]]", folder: "" },
  ]);
  const id = (title: string) => useVault.getState().notes.find((n) => n.title === title)!.id;
  return { useVault, id };
}

beforeEach(() => localStorage.clear());

describe("folder names", () => {
  it("refuses names that can't be a folder", () => {
    for (const bad of ["", "  ", "a/../b", "..", ".hidden", "a:b", "a*b", "a?", "x/", "/x", "a\\b", "end."]) {
      expect(folderNameError(bad), bad).not.toBeNull();
    }
    for (const ok of ["Projects", "Projects/Alpha", "Заметки", "2026 Q4"]) expect(folderNameError(ok), ok).toBeNull();
  });
});

describe("empty folders", () => {
  it("a new folder shows in the tree while empty, nested too, and survives a reload", async () => {
    const useVault = await load();
    expect(useVault.getState().addFolder("Inbox/Later")).toBeNull();
    expect(paths(treeOf(useVault.getState()))).toEqual(expect.arrayContaining(["Inbox", "Inbox/Later"]));
    await tick();
    const after = await load();
    expect(paths(treeOf(after.getState()))).toEqual(expect.arrayContaining(["Inbox", "Inbox/Later"]));
  });

  it("refuses a folder that already exists (case-insensitively)", async () => {
    const { useVault } = await setup();
    expect(useVault.getState().addFolder("projects")).toMatch(/exists/);
    expect(useVault.getState().addFolder("../x")).not.toBeNull();
  });
});

describe("renaming and moving a folder", () => {
  it("moves every note inside (nested too) and keeps [[links]] into it resolving", async () => {
    const { useVault, id } = await setup();
    useVault.getState().toggleFolder("Projects/Alpha");
    useVault.getState().setFolderColor("Projects", "#ff0000");
    expect(useVault.getState().renameFolder("Projects", "Work")).toBeNull();
    const s = useVault.getState();
    expect(s.notesById.get(id("Target"))!.folder).toBe("Work/Alpha");
    expect(s.notesById.get(id("Top"))!.folder).toBe("Work");
    expect(paths(treeOf(s))).not.toContain("Projects");
    expect(s.linksOf(id("Linker")).map((n) => n.title)).toEqual(["Target"]);
    expect(s.expanded.has("Work/Alpha")).toBe(true);
    expect(s.folderColors).toEqual({ Work: "#ff0000" });
  });

  it("moves a folder into another one, and an empty folder moves too", async () => {
    const { useVault, id } = await setup();
    useVault.getState().addFolder("Archive");
    useVault.getState().addFolder("Projects/Empty");
    expect(useVault.getState().renameFolder("Projects", "Archive/Projects")).toBeNull();
    const s = useVault.getState();
    expect(s.notesById.get(id("Target"))!.folder).toBe("Archive/Projects/Alpha");
    expect(paths(treeOf(s))).toEqual(
      expect.arrayContaining(["Archive", "Archive/Projects", "Archive/Projects/Alpha", "Archive/Projects/Empty"]),
    );
    expect(paths(treeOf(s)).filter((p) => p.startsWith("Projects"))).toEqual([]);
  });

  it("refuses moving a folder into itself or onto an existing folder, and changes nothing", async () => {
    const { useVault, id } = await setup();
    useVault.getState().addFolder("Other");
    expect(useVault.getState().renameFolder("Projects", "Projects/Alpha/Projects")).toMatch(/itself/);
    expect(useVault.getState().renameFolder("Projects", "other")).toMatch(/exists/);
    expect(useVault.getState().renameFolder("Nope", "X")).not.toBeNull();
    expect(useVault.getState().notesById.get(id("Target"))!.folder).toBe("Projects/Alpha");
  });

  it("the rename survives a reload", async () => {
    const { useVault, id } = await setup();
    const target = id("Target");
    useVault.getState().addFolder("Projects/Empty");
    useVault.getState().renameFolder("Projects", "Work");
    await tick();
    const after = await load();
    expect(after.getState().notesById.get(target)!.folder).toBe("Work/Alpha");
    expect(paths(treeOf(after.getState()))).toEqual(expect.arrayContaining(["Work/Empty"]));
    expect(paths(treeOf(after.getState()))).not.toContain("Projects/Empty");
  });
});

describe("renaming a built-in folder", () => {
  it("the built-in notes stay in the renamed folder after a reload", async () => {
    const useVault = await load();
    const seed = useVault.getState().notes.find((n) => n.folder)!;
    const top = seed.folder.split("/")[0];
    expect(useVault.getState().renameFolder(top, "Renamed")).toBeNull();
    await tick();
    const after = await load();
    expect(after.getState().notesById.get(seed.id)!.folder).toBe(seed.folder.replace(top, "Renamed"));
    expect(paths(treeOf(after.getState()))).not.toContain(top);
  });
});

describe("deleting a folder", () => {
  it("removes the folder and its notes, and Undo brings them all back", async () => {
    const { useVault, id } = await setup();
    const target = id("Target");
    useVault.getState().addFolder("Projects/Empty");
    expect(useVault.getState().notesIn("Projects")).toBe(2);
    useVault.getState().removeFolder("Projects");
    let s = useVault.getState();
    expect(s.notesById.has(target)).toBe(false);
    expect(paths(treeOf(s)).filter((p) => p.startsWith("Projects"))).toEqual([]);
    const toast = s.toasts[s.toasts.length - 1];
    expect(toast.message).toMatch(/Deleted folder “Projects” and 2 notes/);
    toast.action!.run();
    s = useVault.getState();
    expect(s.notesById.get(target)!.folder).toBe("Projects/Alpha");
    expect(paths(treeOf(s))).toEqual(expect.arrayContaining(["Projects/Empty"]));
  });
});
