import "fake-indexeddb/auto"; // a real (in-memory) IndexedDB for this file
import { beforeEach, describe, expect, it, vi } from "vitest";

// the vault's Attachments/ folder, as Rust would list and read it
const disk = vi.hoisted(() => ({
  files: new Map<string, { size: number; modified: number; pages: string[] }>(),
  broken: new Set<string>(),
}));
const read = vi.fn(async (rel: string) => {
  const f = disk.files.get(rel);
  if (!f) throw new Error(`Attachment not found: ${rel}`);
  return new TextEncoder().encode(JSON.stringify(f.pages)).buffer as ArrayBuffer;
});
vi.mock("../vault/attachments", () => ({
  listPdfAttachments: async () =>
    [...disk.files].map(([rel, f]) => ({ rel, size: f.size, modified: f.modified })),
  readAttachment: read,
}));
// "parsing" a PDF = decoding the page texts stored above (pdf.js itself is covered in pdfText.test)
const extract = vi.fn(async (data: ArrayBuffer) => {
  const pages = JSON.parse(new TextDecoder().decode(data)) as string[];
  if (pages.includes("BROKEN")) throw new Error("Invalid PDF structure");
  return pages;
});
vi.mock("./pdfText", async (orig) => ({ ...(await orig<typeof import("./pdfText")>()), extractPdfPages: extract }));

const put = (rel: string, pages: string[], modified = 1000) =>
  disk.files.set(rel, { size: JSON.stringify(pages).length, modified, pages });

/** A fresh copy of the module = what the app sees on a new launch (same IndexedDB underneath). */
async function launch() {
  vi.resetModules();
  return import("./pdfIndex");
}

const rels = (m: Awaited<ReturnType<typeof launch>>) => m.usePdfIndex.getState().docs.map((d) => d.rel);

describe("PDF text index", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("inkwell-pdf-text");
    disk.files.clear();
    read.mockClear();
    extract.mockClear();
    put("Attachments/paper.pdf", ["Intro", "Methods", "We report BLEU scores"]);
    put("Attachments/book.pdf", ["Chapter one"]);
  });

  it("extracts every PDF once, with passages that keep their page", async () => {
    const m = await launch();
    await m.syncPdfIndex("D:/Vault");
    expect(extract).toHaveBeenCalledTimes(2);
    const s = m.usePdfIndex.getState();
    expect(s.ready).toBe(true);
    expect(rels(m)).toEqual(["Attachments/book.pdf", "Attachments/paper.pdf"]);
    const paper = s.docs.find((d) => d.rel === "Attachments/paper.pdf")!;
    expect(paper.pages).toBe(3);
    expect(paper.passages.find((p) => p.text.includes("BLEU"))?.page).toBe(3);
  });

  it("an unchanged PDF is not read or re-extracted — not on the next sync, not after a restart", async () => {
    const m = await launch();
    await m.syncPdfIndex("D:/Vault");
    read.mockClear();
    extract.mockClear();

    await m.syncPdfIndex("D:/Vault");
    expect(read).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();

    const next = await launch();
    await next.syncPdfIndex("D:/Vault");
    expect(read).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expect(rels(next)).toEqual(["Attachments/book.pdf", "Attachments/paper.pdf"]);
  });

  it("only a changed PDF is re-extracted", async () => {
    const m = await launch();
    await m.syncPdfIndex("D:/Vault");
    extract.mockClear();

    put("Attachments/book.pdf", ["Chapter one, revised"], 2000);
    await m.syncPdfIndex("D:/Vault");
    expect(extract).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenLastCalledWith("Attachments/book.pdf");
    expect(m.usePdfIndex.getState().docs.find((d) => d.rel === "Attachments/book.pdf")?.passages[0].text).toBe(
      "Chapter one, revised",
    );
  });

  it("a new PDF is added and a deleted one removed (also from the cache)", async () => {
    const m = await launch();
    await m.syncPdfIndex("D:/Vault");
    disk.files.delete("Attachments/book.pdf");
    put("Attachments/new.pdf", ["Fresh"]);
    await m.syncPdfIndex("D:/Vault");
    expect(rels(m)).toEqual(["Attachments/new.pdf", "Attachments/paper.pdf"]);

    // the deleted one comes back with the same size/time: it must be extracted again
    put("Attachments/book.pdf", ["Chapter one"]);
    extract.mockClear();
    await (await launch()).syncPdfIndex("D:/Vault");
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("a scanned PDF is listed as scanned (no passages); a broken one doesn't stop the others", async () => {
    put("Attachments/scan.pdf", ["", ""]);
    put("Attachments/bad.pdf", ["BROKEN"]);
    const m = await launch();
    await m.syncPdfIndex("D:/Vault");
    const s = m.usePdfIndex.getState();
    const scan = s.docs.find((d) => d.rel === "Attachments/scan.pdf")!;
    expect(scan).toMatchObject({ scanned: true, passages: [], pages: 2 });
    expect(s.failed).toEqual(["Attachments/bad.pdf"]);
    expect(rels(m)).toContain("Attachments/paper.pdf");
    expect(m.pdfStatus(s)).toEqual({ searchable: 2, scanned: ["scan.pdf"], failed: ["bad.pdf"], pending: 0 });

    // the broken one isn't re-read on every sync — only once it changes
    read.mockClear();
    await m.syncPdfIndex("D:/Vault");
    expect(read).not.toHaveBeenCalled();
    expect(m.usePdfIndex.getState().failed).toEqual(["Attachments/bad.pdf"]);
    put("Attachments/bad.pdf", ["Repaired"], 3000);
    await m.syncPdfIndex("D:/Vault");
    expect(read).toHaveBeenCalledWith("Attachments/bad.pdf");
    expect(m.usePdfIndex.getState().failed).toEqual([]);
  });

  it("another vault's PDFs are not shown, and no vault means no PDFs", async () => {
    const m = await launch();
    await m.syncPdfIndex("D:/Vault");
    disk.files.clear();
    put("Attachments/other.pdf", ["Other vault"]);
    await m.syncPdfIndex("E:/Other");
    expect(rels(m)).toEqual(["Attachments/other.pdf"]);
    await m.syncPdfIndex(null);
    expect(m.usePdfIndex.getState()).toMatchObject({ docs: [], ready: false });
  });

  it("passage keys are unique per PDF, page and passage", async () => {
    const m = await launch();
    expect(m.passageKey("Attachments/a.pdf", 3, 1)).toBe("pdf:Attachments/a.pdf#3.1");
    expect(m.parsePassageKey("pdf:Attachments/a#b.pdf#3.1")).toEqual({ rel: "Attachments/a#b.pdf", page: 3, idx: 1 });
    expect(m.parsePassageKey("note-id")).toBeNull();
  });
});
