import { describe, expect, it } from "vitest";
import { parseWikilinkIds } from "./markdown";
import { titleResolver } from "./data/derive";
import type { Note } from "./data/vault";

const note = (id: string, title: string, content = ""): Note => ({ id, title, folder: "", kind: "note", links: [], content });
const resolve = titleResolver([note("a", "Alpha"), note("b", "Beta")]);

describe("parseWikilinkIds", () => {
  it("ignores [[links]] shown as code", () => {
    const md = "Real [[Alpha]].\n\n```\n[[Beta]]\n```\n\nInline `[[Beta]]` too.";
    expect(parseWikilinkIds(md, resolve)).toEqual(["a"]);
  });
  it("resolves [[Note#Heading]] and [[Note#Heading|alias]] to the note", () => {
    expect(parseWikilinkIds("[[Alpha#Intro]] and [[Beta#Usage|see here]]", resolve)).toEqual(["a", "b"]);
  });
  it("resolves the table-escaped [[Note\\|alias]] form", () => {
    expect(parseWikilinkIds("| [[Alpha\\|the alpha]] |", resolve)).toEqual(["a"]);
  });
  it("a same-note heading link [[#Heading]] links nothing", () => {
    expect(parseWikilinkIds("[[#Heading]]", resolve)).toEqual([]);
  });
});

describe("titleResolver", () => {
  it("duplicate titles: the first note keeps the title (no silent last-wins)", () => {
    const r = titleResolver([note("first", "Same"), note("second", "Same")]);
    expect(r("same")).toBe("first");
  });
});
