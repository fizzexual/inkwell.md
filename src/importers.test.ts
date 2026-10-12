import { describe, expect, it } from "vitest";
import type { Note } from "./data/vault";
import { vaultJson } from "./export";
import { parseVaultJson } from "./importers";

const notes: Note[] = [
  { id: "a", title: "Alpha", folder: "Projects/AI", kind: "note", links: [], content: "# Alpha\n\nSee [[Beta]]" },
  { id: "b", title: "Beta", folder: "", kind: "source", links: ["a"], content: "---\ncitekey: b2020\n---\n# Beta" },
  { id: "c", title: "Seed note", folder: "Start", kind: "note", links: [] }, // demo notes may have no content
];

describe("parseVaultJson", () => {
  it("re-imports exactly what the JSON backup export writes", () => {
    const { items, skipped } = parseVaultJson(vaultJson(notes));
    expect(skipped).toBe(0);
    expect(items).toEqual([
      { title: "Alpha", content: "# Alpha\n\nSee [[Beta]]", folder: "Projects/AI", kind: "note" },
      { title: "Beta", content: "---\ncitekey: b2020\n---\n# Beta", folder: "", kind: "source" },
      { title: "Seed note", content: "# Seed note\n", folder: "Start", kind: "note" },
    ]);
  });

  it("rejects files that are not an Inkwell backup", () => {
    expect(() => parseVaultJson("not json")).toThrow(/Inkwell JSON backup/);
    expect(() => parseVaultJson("[]")).toThrow(/Inkwell JSON backup/);
    expect(() => parseVaultJson(JSON.stringify({ version: 1, notes: "x" }))).toThrow(/Inkwell JSON backup/);
    expect(() => parseVaultJson(JSON.stringify({ notes: [] }))).toThrow(/Inkwell JSON backup/);
  });

  it("rejects a backup from a newer, unknown format version", () => {
    expect(() => parseVaultJson(JSON.stringify({ version: 2, notes: [] }))).toThrow(/version 2/);
  });

  it("skips malformed notes and counts them", () => {
    const text = JSON.stringify({
      version: 1,
      notes: [
        { id: "ok", title: "Fine", folder: "", kind: "note", links: [], content: "x" },
        { id: "bad1", folder: "" },
        null,
        { id: "bad2", title: "   ", content: "x" },
        { id: "weird", title: "Odd kind", folder: 7, kind: "alien", content: 5 },
      ],
    });
    const { items, skipped } = parseVaultJson(text);
    expect(skipped).toBe(3);
    expect(items).toEqual([
      { title: "Fine", content: "x", folder: "", kind: "note" },
      { title: "Odd kind", content: "# Odd kind\n", folder: "", kind: "note" },
    ]);
  });
});
