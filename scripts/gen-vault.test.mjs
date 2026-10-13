import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateVault, writeVault, LONG_FOLDER } from "./gen-vault.mjs";

describe("gen-vault", () => {
  it("is deterministic per seed and makes count + long notes", () => {
    const a = generateVault({ count: 200, seed: 7 });
    expect(a).toEqual(generateVault({ count: 200, seed: 7 }));
    expect(a).not.toEqual(generateVault({ count: 200, seed: 8 }));
    expect(a).toHaveLength(203);
    expect(new Set(a.map((f) => f.rel.toLowerCase())).size).toBe(a.length); // no file name clashes
  });

  it("writes realistic notes: links to real titles, tags, headings, queries, 20k-word long reads", () => {
    const files = generateVault({ count: 200, seed: 1 });
    const titles = new Set(files.map((f) => f.content.match(/^# (.+)$/m)[1]));
    const links = files.flatMap((f) => [...f.content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]));
    expect(links.length).toBeGreaterThan(200);
    expect(links.every((t) => titles.has(t))).toBe(true);
    expect(files.filter((f) => f.content.includes("```query")).length).toBeGreaterThanOrEqual(4);
    expect(files.some((f) => /(^|\s)#[a-z]/.test(f.content))).toBe(true);
    const long = files.find((f) => f.rel === `${LONG_FOLDER}/Long Read 1.md`);
    expect(long.content.split(/\s+/).length).toBeGreaterThanOrEqual(20000);
  });

  it("writes into a new folder but never into one that already has files", () => {
    const dir = mkdtempSync(join(tmpdir(), "inkwell-gen-"));
    try {
      expect(writeVault(join(dir, "v"), { count: 20, longWords: 300 })).toBe(23);
      expect(readFileSync(join(dir, "v", LONG_FOLDER, "Long Read 1.md"), "utf8")).toMatch(/^# Long Read 1/);
      writeFileSync(join(dir, "keep.md"), "mine");
      expect(() => writeVault(dir, { count: 20, longWords: 300 })).toThrow(/not empty/);
      expect(readFileSync(join(dir, "keep.md"), "utf8")).toBe("mine");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
