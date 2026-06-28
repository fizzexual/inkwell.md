export interface Card {
  id: string;
  noteId: string;
  q: string;
  a: string;
  line: number;
}

/** Lines of the form `Question :: Answer` become flashcards. */
export function parseCards(noteId: string, content: string): Card[] {
  const out: Card[] = [];
  content.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    // skip headings, urls, table rows and lines with code (avoids false positives)
    if (!line || line.startsWith("#") || line.includes("://") || line.includes("`") || line.includes("|"))
      return;
    const m = raw.match(/^\s*(?:[-*]\s+)?(.+?)\s*::\s*(.+?)\s*$/);
    if (m) out.push({ id: `${noteId}:${i}`, noteId, q: m[1].trim(), a: m[2].trim(), line: i });
  });
  return out;
}
