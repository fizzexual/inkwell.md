// @vitest-environment jsdom
// Typing must not rebuild the whole vault's derived data: the link graph, tree, title resolver,
// citations and tag counts keep their identity (so nothing subscribed to them re-renders) unless
// the keystroke really changed them — and when it did, the result equals a full rebuild.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../data/vault";
import {
  buildBacklinks,
  buildCiteMap,
  buildGraph,
  buildLinkMap,
  buildTagCounts,
  titleResolver,
} from "../data/derive";

const note = (id: string, title: string, folder: string, content: string): Note => ({
  id,
  title,
  folder,
  kind: "note",
  links: [],
  content,
});

const VAULT = [
  note("a.md", "Alpha", "", "# Alpha\n\nSee [[Beta]]. #ml\n\nSome prose here."),
  note("b.md", "Beta", "Src", "---\ncitekey: b2020\nauthors: Bo\nyear: 2020\n---\n# Beta\n\n```query\ntag: ml\n```"),
  note("c.md", "Gamma", "Src", "# Gamma\n\n![[Alpha]] and [[Alpha]] #ml #draft"),
];

async function store() {
  localStorage.clear();
  vi.resetModules();
  const { useVault } = await import("./useVault");
  useVault.getState().loadDiskVault("v", VAULT.map((n) => ({ ...n })));
  return useVault;
}

/** What a from-scratch rebuild of the derived data gives for these notes. */
function rebuilt(notes: Note[]) {
  const resolve = titleResolver(notes);
  const linkMap = buildLinkMap(notes, resolve);
  return {
    linkMap,
    backlinkMap: buildBacklinks(linkMap),
    graph: buildGraph(notes, linkMap),
    citeMap: buildCiteMap(notes),
    tagCounts: buildTagCounts(notes),
  };
}

function expectMatchesRebuild(s: { notes: Note[] } & ReturnType<typeof rebuilt>) {
  const r = rebuilt(s.notes);
  expect(s.linkMap).toEqual(r.linkMap);
  expect(s.backlinkMap).toEqual(r.backlinkMap);
  expect(s.graph).toEqual(r.graph);
  expect(s.citeMap).toEqual(r.citeMap);
  expect(s.tagCounts).toEqual(r.tagCounts);
}

describe("typing in a note", () => {
  beforeEach(() => localStorage.clear());

  it("plain prose keeps every vault-wide derived structure (no rebuild, no re-render)", async () => {
    const useVault = await store();
    const before = useVault.getState();
    useVault.getState().updateContent("a.md", "# Alpha\n\nSee [[Beta]]. #ml\n\nSome prose here, more words.");
    const s = useVault.getState();
    expect(s.notesById.get("a.md")!.content).toContain("more words");
    expect(s.tree).toBe(before.tree);
    expect(s.graph).toBe(before.graph);
    expect(s.linkMap).toBe(before.linkMap);
    expect(s.backlinkMap).toBe(before.backlinkMap);
    expect(s.resolve).toBe(before.resolve);
    expect(s.citeMap).toBe(before.citeMap);
    expect(s.tagCounts).toBe(before.tagCounts);
    expect(s.metaRev).toBe(before.metaRev);
    expectMatchesRebuild(s);
  });

  it("typing a [[link]] updates links, backlinks and the graph exactly like a rebuild", async () => {
    const useVault = await store();
    const before = useVault.getState();
    useVault.getState().updateContent("a.md", "# Alpha\n\nSee [[Beta]] and [[Gamma]]. #ml");
    const s = useVault.getState();
    expect(s.linkMap.get("a.md")).toEqual(["b.md", "c.md"]);
    expect(s.backlinkMap.get("c.md")).toEqual(["a.md"]);
    expect(s.tree).toBe(before.tree); // titles and folders unchanged
    expectMatchesRebuild(s);
  });

  it("typing a new #tag updates tag counts and bumps metaRev (queries can see tags)", async () => {
    const useVault = await store();
    const before = useVault.getState();
    useVault.getState().updateContent("a.md", "# Alpha\n\nSee [[Beta]]. #ml #draft");
    const s = useVault.getState();
    expect(s.tagCounts.get("draft")).toBe(2);
    expect(s.metaRev).not.toBe(before.metaRev);
    expect(s.linkMap).toBe(before.linkMap);
    expectMatchesRebuild(s);
  });

  it("editing frontmatter bumps metaRev and rebuilds citations", async () => {
    const useVault = await store();
    const before = useVault.getState();
    useVault.getState().updateContent("b.md", "---\ncitekey: b2021\nauthors: Bo\nyear: 2021\n---\n# Beta");
    const s = useVault.getState();
    expect(s.metaRev).not.toBe(before.metaRev);
    expect(s.citeMap.get("b2021")?.year).toBe("2021");
    expect(s.citeMap.has("b2020")).toBe(false);
    expectMatchesRebuild(s);
  });

  it("a new heading retitles the note: links elsewhere resolve to it, the tree re-sorts", async () => {
    const useVault = await store();
    const before = useVault.getState();
    useVault.getState().updateContent("b.md", "# Zeta\n\nbody");
    // Alpha's [[Beta]] now points nowhere
    expect(useVault.getState().linkMap.get("a.md")).toEqual([]);
    expectMatchesRebuild(useVault.getState());
    useVault.getState().updateContent("a.md", "# Alpha\n\n[[Zeta]] #ml");
    const s = useVault.getState();
    expect(s.resolve("zeta")).toBe("b.md");
    expect(s.resolve("Beta")).toBeUndefined();
    expect(s.linkMap.get("a.md")).toEqual(["b.md"]);
    expect(s.tree).not.toBe(before.tree);
    expect(s.tree.folders[0].notes.map((n) => n.title)).toEqual(["Gamma", "Zeta"]);
    expectMatchesRebuild(s);
  });

  it("retitling the first of two same-titled notes hands its links to the other one", async () => {
    const useVault = await store();
    useVault.getState().updateContent("b.md", "# Gamma\n\nnow a second Gamma");
    useVault.getState().updateContent("a.md", "# Alpha\n\n[[Gamma]]");
    expect(useVault.getState().linkMap.get("a.md")).toEqual(["b.md"]); // b comes first in the vault
    useVault.getState().updateContent("b.md", "# Beta again");
    const s = useVault.getState();
    expect(s.linkMap.get("a.md")).toEqual(["c.md"]);
    expect(s.backlinkMap.get("c.md")).toEqual(["a.md"]);
    expectMatchesRebuild(s);
  });

  it("an alias added in frontmatter resolves like a rebuild", async () => {
    const useVault = await store();
    useVault.getState().updateContent("c.md", "---\naliases:\n  - G\n---\n# Gamma\n\n[[Alpha]]");
    useVault.getState().updateContent("a.md", "# Alpha\n\n[[G]]");
    const s = useVault.getState();
    expect(s.resolve("g")).toBe("c.md");
    expect(s.linkMap.get("a.md")).toEqual(["c.md"]);
    expectMatchesRebuild(s);
  });

  it("undo after typing restores links and tags like a rebuild", async () => {
    const useVault = await store();
    useVault.getState().updateContent("a.md", "# Alpha\n\n[[Gamma]] #new");
    useVault.getState().undo();
    const s = useVault.getState();
    expect(s.notesById.get("a.md")!.content).toBe(VAULT[0].content);
    expectMatchesRebuild(s);
  });
});
