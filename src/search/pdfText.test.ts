import { describe, expect, it } from "vitest";
// the real parser (Node-friendly build) on a real PDF — no fake pdf.js here
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPdfPages, isScanned, pageText, searchPdfText, splitPassages, type PdfDocText } from "./pdfText";
import { makePdf } from "./testPdf";

const lib = pdfjs as unknown as Parameters<typeof extractPdfPages>[1];

const sentence = (i: number) => `Sentence number ${i} talks about translation quality. `;
const long = (n: number) => Array.from({ length: n }, (_, i) => sentence(i)).join("");

describe("pageText", () => {
  it("joins text runs and turns line ends into spaces", () => {
    const items = [{ str: "Hello", hasEOL: true }, { type: "beginMarkedContent" }, { str: "world" }, { str: "!" }];
    expect(pageText(items)).toBe("Hello world!");
  });
});

describe("splitPassages", () => {
  it("keeps the page number of every passage", () => {
    const ps = splitPassages(["first page text", "", "third page text"]);
    expect(ps.map((p) => [p.page, p.idx, p.text])).toEqual([
      [1, 0, "first page text"],
      [3, 0, "third page text"],
    ]);
  });

  it("splits a dense page into at most 3 passages, at sentence ends, losing no text", () => {
    const text = long(80); // ~4400 chars
    const ps = splitPassages(["short", text]);
    const p2 = ps.filter((p) => p.page === 2);
    expect(p2.length).toBe(3);
    expect(p2.map((p) => p.idx)).toEqual([0, 1, 2]);
    for (const p of p2.slice(0, -1)) expect(p.text.endsWith(".")).toBe(true);
    expect(p2.map((p) => p.text).join(" ")).toBe(text.trim());
  });

  it("a medium page becomes 2 passages", () => {
    expect(splitPassages([long(25)]).length).toBe(2); // ~1400 chars
  });
});

describe("extractPdfPages (real pdf.js)", () => {
  it("reads every page's text in order", async () => {
    const pages = await extractPdfPages(makePdf(["Intro", "Methods (short)", "We report BLEU scores"]), lib);
    expect(pages).toEqual(["Intro", "Methods (short)", "We report BLEU scores"]);
  });

  it("a scanned PDF (pages without text) is detected, not an error", async () => {
    const pages = await extractPdfPages(makePdf(["", ""]), lib);
    expect(pages).toEqual(["", ""]);
    expect(isScanned(pages)).toBe(true);
    expect(isScanned(["Real text on a page"])).toBe(false);
  });
});

describe("searchPdfText", () => {
  it("finds a phrase on page 3 of a PDF, with the page and a snippet", async () => {
    const pages = await extractPdfPages(
      makePdf(["Introduction to machine translation", "Related work", "Results: we report BLEU scores for all systems"]),
      lib,
    );
    const doc: PdfDocText = { rel: "Attachments/paper.pdf", pages: pages.length, passages: splitPassages(pages), scanned: false };
    const hits = searchPdfText([doc], "bleu scores");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ rel: "Attachments/paper.pdf", name: "paper.pdf", page: 3 });
    expect(hits[0].snippet.match).toBe("BLEU scores");
    expect(hits[0].snippet.before).toContain("we report");
  });

  it("finds a phrase that straddles two passages of the same page", () => {
    const passages = [
      { page: 1, idx: 0, text: "The first part ends with BLEU" },
      { page: 1, idx: 1, text: "scores and the second part goes on." },
    ];
    const hit = searchPdfText([{ rel: "a.pdf", pages: 1, passages, scanned: false }], "BLEU scores");
    expect(hit.map((h) => [h.page, h.snippet.match])).toEqual([[1, "BLEU scores"]]);
  });

  it("one hit per matching page, and nothing for an empty query", () => {
    const passages = splitPassages(["cat", "dog", "cat and dog"]);
    const docs = [{ rel: "Attachments/pets.pdf", pages: 3, passages, scanned: false }];
    expect(searchPdfText(docs, "cat").map((h) => h.page)).toEqual([1, 3]);
    expect(searchPdfText(docs, "  ")).toEqual([]);
  });
});
