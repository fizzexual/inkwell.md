// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteTitle } from "../data/derive";
import { renameWikilinks } from "../markdown";

describe("noteTitle", () => {
  it("takes the first heading outside fenced code and frontmatter", () => {
    expect(noteTitle("```sh\n# not a title\n```\n\n# Real\n")).toBe("Real");
    expect(noteTitle("---\n# yaml comment\ntags: x\n---\n# Real\n")).toBe("Real");
    expect(noteTitle("~~~\n# inside\n~~~\ntext")).toBeUndefined();
  });
});

describe("renameWikilinks", () => {
  it("rewrites exact (case-insensitive) title links, keeps heading/alias, skips code and other titles", () => {
    const md = "[[Old]] [[old|x]] [[Old#Part]] [[Old\\|y]] [[Older]] `[[Old]]`\n```\n[[Old]]\n```";
    const out = renameWikilinks(md, "Old", "New");
    expect(out.count).toBe(4);
    expect(out.md).toBe("[[New]] [[New|x]] [[New#Part]] [[New\\|y]] [[Older]] `[[Old]]`\n```\n[[Old]]\n```");
  });
});

describe("retitling a note keeps [[links]] pointing at it", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  async function setup() {
    const { useVault } = await import("./useVault");
    const v = useVault.getState();
    v.importNotes([
      { title: "Old", content: "# Old\n\nbody" },
      { title: "Linker", content: "see [[Old]] and [[Old#Part|that part]]" },
    ]);
    const s = useVault.getState();
    const a = s.notes.find((n) => n.title === "Old")!;
    const b = s.notes.find((n) => n.title === "Linker")!;
    return { useVault, a: a.id, b: b.id };
  }

  it("rewrites links once the edit ends, not on every keystroke", async () => {
    const { useVault, a, b } = await setup();
    const v = useVault.getState();
    v.openArticle(a);
    v.setEditing(true);
    for (const t of ["N", "Ne", "New"]) useVault.getState().updateContent(a, `# ${t}\n\nbody`);
    // still typing: nothing rewritten into intermediate titles
    expect(useVault.getState().notesById.get(b)!.content).toBe("see [[Old]] and [[Old#Part|that part]]");
    useVault.getState().setEditing(false);
    expect(useVault.getState().notesById.get(b)!.content).toBe("see [[New]] and [[New#Part|that part]]");
    expect(useVault.getState().linksOf(b).map((n) => n.id)).toEqual([a]);
  });

  it("switching to another note while editing also settles the rename", async () => {
    const { useVault, a, b } = await setup();
    useVault.getState().openArticle(a);
    useVault.getState().setEditing(true);
    useVault.getState().updateContent(a, "# Renamed\n");
    useVault.getState().openArticle(b);
    expect(useVault.getState().notesById.get(b)!.content).toContain("[[Renamed]]");
  });
});
