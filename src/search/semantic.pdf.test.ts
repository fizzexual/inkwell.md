import "fake-indexeddb/auto"; // a real (in-memory) IndexedDB for this file
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Note } from "../data/vault";
import type { PdfDocText } from "./pdfText";

// the ML worker is replaced by a deterministic fake "model": one dimension per known word
const WORDS = ["cat", "dog", "pet", "tax", "money", "bank", "bleu", "translation"];
const fakeEmbed = vi.fn(async (text: string) => {
  const t = text.toLowerCase();
  const v = new Float32Array(WORDS.map((w) => (t.includes(w) ? 1 : 0)));
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
});
vi.mock("../ml/host", () => ({ ml: { load: vi.fn(async () => null), embed: fakeEmbed, transcribe: vi.fn() } }));

const note = (id: string, title: string, content = ""): Note => ({ id, title, content }) as Note;
const vault = [note("a", "Cats", "cat pet"), note("b", "Dogs", "dog pet")];
const paper: PdfDocText = {
  rel: "Attachments/paper.pdf",
  pages: 3,
  scanned: false,
  passages: [
    { page: 1, idx: 0, text: "Introduction" },
    { page: 3, idx: 0, text: "We measure translation quality with BLEU" },
  ],
};

/** A fresh launch: semantic.ts + the PDF index it reads (same IndexedDB underneath). */
async function launch(docs: PdfDocText[] | null) {
  vi.resetModules();
  const pdf = await import("./pdfIndex");
  if (docs) pdf.usePdfIndex.setState({ vault: "D:/V", docs, ready: true });
  const mod = await import("./semantic");
  await mod.whenIndexLoaded();
  return mod;
}

describe("PDF passages in the semantic index", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("inkwell-semantic");
    fakeEmbed.mockClear();
  });

  it("a PDF passage is found by meaning, with its file and page", async () => {
    const s = await launch([paper]);
    const hits = await s.semanticSearch("translation quality metric", vault, 3);
    expect(hits[0].pdf).toEqual({ rel: "Attachments/paper.pdf", page: 3, text: paper.passages[1].text });
  });

  it("passages are embedded once: a restart (or a note-only change) doesn't re-embed them", async () => {
    await (await launch([paper])).ensureIndexed(vault);
    expect(fakeEmbed).toHaveBeenCalledTimes(4); // 2 notes + 2 passages
    fakeEmbed.mockClear();
    await (await launch([paper])).ensureIndexed([...vault, note("c", "Money", "money")]);
    expect(fakeEmbed).toHaveBeenCalledTimes(1);
    expect(fakeEmbed.mock.calls[0][0]).toContain("Money");
  });

  it("a deleted PDF's passages are dropped (once the PDF index has the vault's listing)", async () => {
    await (await launch([paper])).ensureIndexed(vault);
    const s = await launch([]);
    await s.ensureIndexed(vault);
    expect((await s.semanticSearch("BLEU translation", vault, 5)).some((h) => h.pdf)).toBe(false);

    fakeEmbed.mockClear();
    await (await launch([paper])).ensureIndexed(vault); // it comes back → embedded again
    expect(fakeEmbed).toHaveBeenCalledTimes(2);
  });

  it("before the PDF index is ready, stored passage vectors are kept but never shown", async () => {
    await (await launch([paper])).ensureIndexed(vault);
    const s = await launch(null);
    fakeEmbed.mockClear();
    expect((await s.semanticSearch("BLEU translation", vault, 5)).some((h) => h.pdf)).toBe(false);
    // and they were not deleted: the next launch with the PDF index ready reuses them
    await (await launch([paper])).ensureIndexed(vault);
    expect(fakeEmbed).toHaveBeenCalledTimes(1); // only the query above
  });

  it("related notes stay notes — never PDF passages", async () => {
    const s = await launch([paper, { ...paper, rel: "Attachments/pets.pdf", passages: [{ page: 1, idx: 0, text: "cat pet" }] }]);
    const hits = await s.relatedNotes("a", vault, 5);
    expect(hits.map((h) => h.id)).toEqual(["b"]);
  });
});
