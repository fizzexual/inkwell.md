// @vitest-environment jsdom
// What survives a reload: the store is re-imported fresh against the same localStorage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "inkwell.vault.v2";
const tick = () => new Promise((r) => setTimeout(r, 0));

async function load() {
  vi.resetModules();
  const { useVault } = await import("./useVault");
  const { useHistory } = await import("../useHistory");
  return { useVault, useHistory };
}
const saved = () => JSON.parse(localStorage.getItem(KEY) || "{}");

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("deleted notes (bug 3)", () => {
  it("a new note that reuses a deleted note's id survives a reload", async () => {
    const { useVault } = await load();
    useVault.getState().createNote();
    const id = useVault.getState().selectedId;
    useVault.getState().deleteNote(id);
    useVault.getState().createNote();
    expect(useVault.getState().selectedId).toBe(id); // the id is free again, so it is reused
    useVault.getState().updateContent(id, "# Untitled Note\n\nkeep me");
    await tick();
    const after = await load();
    expect(after.useVault.getState().notesById.get(id)?.content).toBe("# Untitled Note\n\nkeep me");
  });

  it("Ctrl+Z after deleting a note survives a reload", async () => {
    const { useVault } = await load();
    useVault.getState().deleteNote("welcome");
    useVault.getState().undo();
    await tick();
    const after = await load();
    expect(after.useVault.getState().notesById.has("welcome")).toBe(true);
  });

  it("a new note titled like a deleted built-in note keeps its own folder and text", async () => {
    const { useVault } = await load();
    useVault.getState().deleteNote("welcome");
    useVault.getState().createNoteWith("Welcome", "# Welcome\n\nmine", "Mine");
    await tick();
    const after = await load();
    const n = after.useVault.getState().notes.find((x) => x.content === "# Welcome\n\nmine");
    expect(n?.folder).toBe("Mine");
  });

  it("a deleted built-in note stays deleted", async () => {
    const { useVault } = await load();
    useVault.getState().deleteNote("welcome");
    await tick();
    const after = await load();
    expect(after.useVault.getState().notesById.has("welcome")).toBe(false);
  });
});

describe("full browser storage (bug 4)", () => {
  it("warns once, and the warning stays until dismissed", async () => {
    const { useVault } = await load();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    for (const t of ["a", "ab", "abc"]) {
      useVault.getState().updateContent("welcome", `# Welcome\n\n${t}`);
      await tick();
    }
    const warnings = useVault.getState().toasts.filter((t) => /storage/i.test(t.message));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].sticky).toBe(true);
  });

  it("version history says so when it can't be saved", async () => {
    const { useVault, useHistory } = await load();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    useHistory.getState().record("welcome", "v1", 1);
    useHistory.getState().record("welcome", "v2", 2);
    const warnings = useVault.getState().toasts.filter((t) => /history/i.test(t.message));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].sticky).toBe(true);
  });
});

describe("disk vault notes stay out of browser storage (bugs 4, 11)", () => {
  const diskNote = { id: "Diary.md", title: "Diary", folder: "", kind: "note" as const, links: [], content: "# Diary\n\nprivate" };

  it("disk note bodies are never persisted, and the demo vault's saved edits are kept", async () => {
    const { useVault } = await load();
    useVault.getState().updateContent("welcome", "# Welcome\n\nmy demo edit");
    await tick();
    useVault.getState().loadDiskVault("C:/vault", [diskNote]);
    useVault.getState().updateContent("Diary.md", "# Diary\n\nprivate, edited");
    await tick();
    const raw = localStorage.getItem(KEY) || "";
    expect(raw).not.toContain("private");
    expect(saved().contents?.welcome).toBe("# Welcome\n\nmy demo edit");
  });

  it("after closing the vault, its notes don't reappear in the demo vault", async () => {
    // storage as an older version left it: disk notes saved as browser notes
    localStorage.setItem(KEY, JSON.stringify({ newNotes: [diskNote], vaultPath: null }));
    const { useVault } = await load();
    expect(useVault.getState().notesById.has("Diary.md")).toBe(false);
  });
});
