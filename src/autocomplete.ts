// Detect an in-progress [[wikilink]] or ![[embed]] immediately before the caret.
// Returns the partial query and the index where it starts, or null.

export interface WikiTrigger {
  query: string;
  start: number; // index of the first query char (just after the `[[`)
  embed: boolean;
}

export function detectWikiTrigger(value: string, caret: number): WikiTrigger | null {
  const before = value.slice(0, caret);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;

  const between = before.slice(open + 2);
  // a closed link or a line break means we're no longer inside the brackets
  if (between.includes("]]") || between.includes("\n")) return null;

  return {
    query: between,
    start: open + 2,
    embed: before[open - 1] === "!",
  };
}
