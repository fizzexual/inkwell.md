import { describe, expect, it } from "vitest";
import { findMentions, mentionText } from "./mentions";

// the per-title regex the Inspector used before (the reference answer)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slow = (text: string, notes: { id: string; title: string }[], self: string) =>
  notes
    .filter((n) => n.id !== self && n.title.length >= 4)
    .filter((n) => new RegExp(`(^|[^\\w[])${escapeRe(n.title)}(?![\\w\\]])`, "i").test(text))
    .slice(0, 8);

const titles = [
  "Linking Notes",
  "linking",
  "Notes",
  "C++ Tips",
  "Café Society",
  "(Draft) plan",
  "x_y_z",
  "Gamma Ray 12",
  "Self",
  "Ink",
  "Ideas?",
  "Over-fitting",
  "Over",
];
const notes = titles.map((title, i) => ({ id: `n${i}`, title }));

describe("findMentions", () => {
  const cases = [
    "We talked about linking notes and Notes in general.",
    "Some C++ tips, café society, (draft) Plan, X_Y_Z and gamma ray 12!",
    "[[Linking Notes]] is linked, but linkingnotes and notesy are not mentions.",
    "Gamma Ray 123 is not Gamma Ray 12; neither is xx_y_z. Ideas? Over-fitting happens.",
    "Self mentions self; Ink is too short.",
    "Overfitting over and Over-fitting]] and [Notes",
    "",
  ];
  it.each(cases)("finds the same mentions as the per-title regex: %s", (raw) => {
    const text = mentionText(raw);
    expect(findMentions(text, notes, "n8")).toEqual(slow(text, notes, "n8"));
  });

  it("stops at the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, title: `Topic ${i}` }));
    const text = many.map((m) => m.title).join(", ");
    expect(findMentions(text, many, "", 8)).toHaveLength(8);
  });

  it("strips frontmatter, code and existing links before looking", () => {
    expect(mentionText("---\ntitle: Notes\n---\nA `Notes` and\n```\nNotes\n```\n[[Notes]] here")).toBe(
      "A  and\n\n here",
    );
  });
});
