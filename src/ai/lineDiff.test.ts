import { describe, expect, it } from "vitest";
import { lineDiff, foldContext } from "./lineDiff";

describe("lineDiff", () => {
  it("marks kept, removed and added lines", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { op: " ", text: "a" },
      { op: "-", text: "b" },
      { op: "+", text: "B" },
      { op: " ", text: "c" },
      { op: "+", text: "d" },
    ]);
  });

  it("shows a change hidden far down a long note", () => {
    const before = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 180", "line 180 <img src=x onerror=steal()>");
    const changed = lineDiff(before, after).filter((l) => l.op !== " ");
    expect(changed).toEqual([
      { op: "-", text: "line 180" },
      { op: "+", text: "line 180 <img src=x onerror=steal()>" },
    ]);
  });

  it("a full wipe shows every removed line", () => {
    const d = lineDiff("x\ny\nz", "");
    expect(d.filter((l) => l.op === "-").map((l) => l.text)).toEqual(["x", "y", "z"]);
  });
});

describe("foldContext", () => {
  it("keeps changes plus 2 lines of context and folds the rest", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "L10");
    const out = foldContext(lineDiff(before, after), 2);
    expect(out.map((l) => (l.op === "…" ? `…${l.text}` : l.op + l.text))).toEqual([
      "…8",
      " l8",
      " l9",
      "-l10",
      "+L10",
      " l11",
      " l12",
      "…7",
    ]);
  });
});
