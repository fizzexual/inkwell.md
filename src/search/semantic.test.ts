import "fake-indexeddb/auto"; // a real (in-memory) IndexedDB for this file
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Note } from "../data/vault";

// the ML worker is replaced by a deterministic fake "model": one dimension per known word
const WORDS = ["cat", "dog", "pet", "tax", "money", "bank"];
const fakeEmbed = vi.fn(async (text: string) => {
  const t = text.toLowerCase();
  const v = new Float32Array(WORDS.map((w) => (t.includes(w) ? 1 : 0)));
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
});
const fakeLoad = vi.fn(async () => null);
vi.mock("../ml/host", () => ({ ml: { load: fakeLoad, embed: fakeEmbed, transcribe: vi.fn() } }));

const note = (id: string, title: string, content = ""): Note => ({ id, title, content }) as Note;
const vault = [note("a", "Cats", "cat pet"), note("b", "Dogs", "dog pet"), note("c", "Taxes", "tax money bank")];

/** A fresh copy of semantic.ts = what the app sees on a new launch (same IndexedDB underneath). */
async function launch() {
  vi.resetModules();
  const mod = await import("./semantic");
  await mod.whenIndexLoaded();
  return mod;
}

describe("semantic index persistence", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("inkwell-semantic");
    fakeEmbed.mockClear();
    fakeLoad.mockClear();
  });

  it("first launch embeds every note; the next launch reuses them all without loading the model", async () => {
    const first = await launch();
    expect(first.isIndexWarm()).toBe(false);
    await first.ensureIndexed(vault);
    expect(fakeEmbed).toHaveBeenCalledTimes(3);

    fakeEmbed.mockClear();
    fakeLoad.mockClear();
    const second = await launch();
    expect(second.isIndexWarm()).toBe(true); // related notes can show straight away
    const hits = await second.relatedNotes("a", vault, 2);
    expect(hits[0].id).toBe("b"); // cats ~ dogs (both pets)
    expect(fakeEmbed).not.toHaveBeenCalled();
    expect(fakeLoad).not.toHaveBeenCalled();
  });

  it("only a note whose text changed is re-embedded after a restart", async () => {
    await (await launch()).ensureIndexed(vault);
    fakeEmbed.mockClear();

    const edited = [vault[0], note("b", "Dogs", "dog pet bank"), vault[2]];
    await (await launch()).ensureIndexed(edited);
    expect(fakeEmbed).toHaveBeenCalledTimes(1);
    expect(fakeEmbed.mock.calls[0][0]).toContain("bank");
  });

  it("a deleted note is dropped from the stored index", async () => {
    await (await launch()).ensureIndexed(vault);
    await (await launch()).ensureIndexed([vault[0], vault[1]]); // "c" deleted

    const third = await launch();
    fakeEmbed.mockClear();
    // "c" comes back: it must be embedded again, i.e. its old vector was really deleted
    await third.ensureIndexed(vault);
    expect(fakeEmbed).toHaveBeenCalledTimes(1);
    expect(fakeEmbed.mock.calls[0][0]).toContain("Taxes");
  });

  it("an empty note list (vault still loading) does not wipe the stored index", async () => {
    await (await launch()).ensureIndexed(vault);
    await (await launch()).ensureIndexed([]);
    fakeEmbed.mockClear();
    await (await launch()).ensureIndexed(vault);
    expect(fakeEmbed).not.toHaveBeenCalled();
  });

  it("search ranks by meaning using cached and fresh vectors together", async () => {
    await (await launch()).ensureIndexed(vault);
    const s = await launch();
    const hits = await s.semanticSearch("money in the bank", vault, 1);
    expect(hits.map((h) => h.id)).toEqual(["c"]);
  });
});
