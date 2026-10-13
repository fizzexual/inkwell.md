export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/** The first (case-insensitive) match of `q` in `content`, with a little text on each side. */
export function makeSnippet(content: string, q: string): Snippet | null {
  const i = content.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, i - 32);
  const end = Math.min(content.length, i + q.length + 48);
  return {
    before: (start > 0 ? "…" : "") + content.slice(start, i),
    match: content.slice(i, i + q.length),
    after: content.slice(i + q.length, end) + (end < content.length ? "…" : ""),
  };
}
