import { describe, expect, it } from "vitest";
import { adoptLegacyReviews, parseCards } from "./flashcards";

describe("flashcard ids", () => {
  it("survive adding a line above the card", () => {
    const before = parseCards("n1", "# Deck\n\nWhat is 2+2? :: 4\nCapital of France? :: Paris");
    const after = parseCards("n1", "# Deck\n\nA new intro line\n\nWhat is 2+2? :: 4\nCapital of France? :: Paris");
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
  });

  it("survive editing the answer", () => {
    const [a] = parseCards("n1", "Q? :: old");
    const [b] = parseCards("n1", "Q? :: new answer");
    expect(b.id).toBe(a.id);
  });

  it("are unique per note, even for a repeated question", () => {
    const cards = parseCards("n1", "Same? :: a\nSame? :: b");
    expect(new Set(cards.map((c) => c.id)).size).toBe(2);
    expect(parseCards("n2", "Same? :: a")[0].id).not.toBe(cards[0].id);
  });
});

describe("adoptLegacyReviews", () => {
  const review = { ease: 2.5, interval: 4, due: "2026-10-20" };

  it("moves history from the old line-number id to the stable id", () => {
    const cards = parseCards("n1", "# Deck\n\nQ? :: A");
    const next = adoptLegacyReviews({ "n1:2": review }, cards);
    expect(next).not.toBeNull();
    expect(next![cards[0].id]).toEqual(review);
    expect(next!["n1:2"]).toBeUndefined();
  });

  it("returns null when there is nothing to move", () => {
    const cards = parseCards("n1", "Q? :: A");
    expect(adoptLegacyReviews({ [cards[0].id]: review }, cards)).toBeNull();
    expect(adoptLegacyReviews({}, cards)).toBeNull();
  });

  it("never overwrites history already stored under the stable id", () => {
    const cards = parseCards("n1", "Q? :: A");
    const newer = { ...review, interval: 9 };
    expect(adoptLegacyReviews({ [cards[0].id]: newer, "n1:0": review }, cards)).toBeNull();
  });
});
