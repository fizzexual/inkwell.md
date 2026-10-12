import { describe, expect, it } from "vitest";
import { relOf } from "./disk";
import type { Note } from "../data/vault";

const fresh = (title: string, folder = ""): Note => ({ id: "new-id", title, folder, kind: "note", links: [], content: "" });

describe("new-note file names", () => {
  it("keep non-Latin letters instead of collapsing to untitled", () => {
    expect(relOf(fresh("Заметка за срещата"), new Set())).toBe("заметка-за-срещата.md");
    expect(relOf(fresh("日本語 メモ"), new Set())).toBe("日本語-メモ.md");
    expect(relOf(fresh("Café notes"), new Set())).toBe("café-notes.md");
  });
  it("never produce a Windows reserved device name", () => {
    for (const t of ["CON", "nul", "Aux", "prn", "com1", "LPT9", "con."]) {
      const rel = relOf(fresh(t), new Set());
      expect(rel, t).toMatch(/_\.md$/);
    }
  });
  it("strip characters Windows forbids", () => {
    expect(relOf(fresh('a<b>:c"d/e\\f|g?h*'), new Set())).toBe("a-b-c-d-e-f-g-h.md");
    expect(relOf(fresh("  trailing dots... "), new Set())).toBe("trailing-dots.md");
  });
});
