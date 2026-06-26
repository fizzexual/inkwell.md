// Lightweight subsequence fuzzy match with a relevance score.
// Returns null when `query` is not a subsequence of `text`.
export interface FuzzyResult {
  score: number;
  ranges: [number, number][]; // matched character index ranges, for highlighting
}

export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  if (!query) return { score: 0, ranges: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  let qi = 0;
  let score = 0;
  let streak = 0;
  const ranges: [number, number][] = [];
  let runStart = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // bonuses: consecutive matches, word boundaries, start of string
      streak += 1;
      score += 1 + streak;
      if (ti === 0 || /[\s/_-]/.test(t[ti - 1])) score += 3;
      if (runStart === -1) runStart = ti;
      qi += 1;
    } else {
      streak = 0;
      if (runStart !== -1) {
        ranges.push([runStart, ti]);
        runStart = -1;
      }
    }
  }
  if (runStart !== -1) ranges.push([runStart, t.length]);
  if (qi < q.length) return null;

  // prefer shorter targets
  score -= text.length * 0.05;
  return { score, ranges };
}
