export interface Card {
  /** stable id: note + a hash of the question, so editing other lines keeps the review history */
  id: string;
  /** the old line-number id (`note:line`), kept only to carry history over once */
  legacyId: string;
  noteId: string;
  q: string;
  a: string;
  line: number;
}

// FNV-1a, base36 — short and stable across sessions
function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Lines of the form `Question :: Answer` become flashcards. */
export function parseCards(noteId: string, content: string): Card[] {
  const out: Card[] = [];
  const seen = new Map<string, number>();
  content.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    // skip headings, urls, table rows and lines with code (avoids false positives)
    if (!line || line.startsWith("#") || line.includes("://") || line.includes("`") || line.includes("|"))
      return;
    const m = raw.match(/^\s*(?:[-*]\s+)?(.+?)\s*::\s*(.+?)\s*$/);
    if (!m) return;
    const q = m[1].trim();
    const base = `${noteId}#${hashText(q.replace(/\s+/g, " "))}`;
    // the same question twice in one note: the 2nd, 3rd… get a suffix
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ id: n === 1 ? base : `${base}~${n}`, legacyId: `${noteId}:${i}`, noteId, q, a: m[2].trim(), line: i });
  });
  return out;
}

/**
 * Carry review history stored under the old line-number ids over to the stable ids.
 * Returns the updated map, or null when nothing needed moving.
 */
export function adoptLegacyReviews<R>(reviews: Record<string, R>, cards: Card[]): Record<string, R> | null {
  let next: Record<string, R> | null = null;
  for (const c of cards) {
    if (!(c.legacyId in reviews) || c.id in reviews) continue;
    next ??= { ...reviews };
    next[c.id] = reviews[c.legacyId];
    delete next[c.legacyId];
  }
  return next;
}
