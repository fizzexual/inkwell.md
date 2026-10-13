// Unlinked mentions: other notes' titles that appear in a note's prose without a [[link]].
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Runs of ASCII word characters — what the mention regex's `\w` boundaries see. */
const WORDS = /[A-Za-z0-9_]+/g;

/** The note's prose as mention detection sees it: no frontmatter, code or existing links. */
export function mentionText(md: string): string {
  return md
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/\[\[[^\]]+\]\]/g, "");
}

// each title's words, once per candidate object (candidates are kept until titles change)
const titleWords = new WeakMap<object, string[] | null>();
function wordsOf(n: { title: string }): string[] | null {
  let w = titleWords.get(n);
  if (w === undefined) {
    w = n.title.toLowerCase().match(WORDS);
    titleWords.set(n, w);
  }
  return w;
}

/**
 * The candidates whose title appears in `text` as a whole phrase (case-insensitive), at most `max`.
 * Same answer as testing every title's regex, but a title is only regex-tested when each of its
 * words is a word of the text — so a 20,000-word note against 5,000 titles stays a few ms.
 */
export function findMentions<T extends { id: string; title: string }>(
  text: string,
  candidates: readonly T[],
  selfId: string,
  max = 8,
): T[] {
  const words = new Set(text.toLowerCase().match(WORDS) ?? []);
  const out: T[] = [];
  for (const n of candidates) {
    if (n.id === selfId || n.title.length < 4) continue;
    const need = wordsOf(n);
    // every word of the title must be a whole word of the text (title words sit between non-word
    // characters or its ends, and so must their match) — a cheap necessary condition
    if (need && !need.every((w) => words.has(w))) continue;
    if (!new RegExp(`(^|[^\\w[])${escapeRe(n.title)}(?![\\w\\]])`, "i").test(text)) continue;
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}
