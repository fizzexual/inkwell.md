// Generate a large, realistic vault of .md files for performance testing.
//   node scripts/gen-vault.mjs <empty-or-new-folder> [--count 5000] [--seed 1]
// Notes have headings, [[wikilinks]] to other notes, #tags, frontmatter, tasks, code, some
// ```query blocks, and a few very long notes (20,000 words) — "Long Reads/Long Read 1.md" etc.
// The same generator feeds the benchmark (src/perf/vault.bench.tsx), so numbers are comparable.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Small fast deterministic PRNG (mulberry32): same seed → same vault. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = (
  "the of and to in is that for it as with was on be by this are from at or an which but not have " +
  "has can all their more one about model network learning data system note idea graph theory value " +
  "layer signal memory process design pattern review method result paper source proof structure " +
  "function vector space time energy market history language reading writing question answer early " +
  "late simple complex local global gradient attention sequence image sound field river city garden"
).split(" ");
const TOPICS = (
  "Attention Backprop Entropy Gradient Kernel Lattice Manifold Markov Neuron Optimizer Pruning " +
  "Quantum Recurrence Sampling Tensor Topology Variance Wavelet Bayes Compiler Database Ecology " +
  "Finance Geology Harmony Ink Journal Kinetics Logic Music Narrative Orbit Poetry Rhetoric Syntax"
).split(" ");
const TAGS = ["ml", "math", "reading", "todo", "idea", "project", "physics", "history", "draft", "review"];
const STATUS = ["todo", "doing", "done"];
const FOLDERS = [
  "Inbox",
  "Projects",
  "Projects/Alpha",
  "Projects/Beta",
  "Research",
  "Research/Papers",
  "Research/Notes",
  "Journal",
  "Journal/2025",
  "Journal/2026",
  "Areas",
  "Areas/Health",
  "Areas/Work",
  "Reference",
  "Archive",
];

export const LONG_FOLDER = "Long Reads";

/**
 * Build the vault in memory: [{ rel, content }]. `rel` is the file path inside the vault
 * (forward slashes), exactly what the app's disk reader hands over.
 */
export function generateVault({ count = 5000, seed = 1, longNotes = 3, longWords = 20000, queryEvery = 50 } = {}) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const sentence = () => {
    const n = int(6, 16);
    const w = [];
    for (let i = 0; i < n; i++) w.push(pick(WORDS));
    w[0] = w[0][0].toUpperCase() + w[0].slice(1);
    return w.join(" ") + ".";
  };

  const titles = [];
  for (let i = 0; i < count; i++) titles.push(`${pick(TOPICS)} ${pick(TOPICS)} ${i + 1}`);
  const linkTo = () => `[[${titles[Math.floor(rand() * titles.length)]}]]`;

  const paragraph = (words) => {
    const parts = [];
    let n = 0;
    while (n < words) {
      let s = sentence();
      if (rand() < 0.25) s = s.replace(/ (\w+)\.$/, ` ${linkTo()}.`);
      if (rand() < 0.08) s += ` #${pick(TAGS)}`;
      parts.push(s);
      n += s.split(" ").length;
    }
    return { text: parts.join(" "), words: n };
  };

  const body = (targetWords) => {
    const out = [];
    let words = 0;
    let section = 0;
    while (words < targetWords) {
      if (words === 0 || rand() < 0.2) out.push(`${rand() < 0.7 ? "##" : "###"} Section ${++section}: ${pick(TOPICS)}`);
      const r = rand();
      if (r < 0.06) {
        out.push(["- [ ] " + sentence(), "- [x] " + sentence(), "- [ ] " + sentence()].join("\n"));
        words += 30;
      } else if (r < 0.09) {
        out.push("```js\nconst x = compute(" + int(1, 99) + ");\nconsole.log(x);\n```");
        words += 5;
      } else if (r < 0.12) {
        out.push("> " + sentence() + " " + linkTo());
        words += 12;
      } else {
        const p = paragraph(int(40, 120));
        out.push(p.text);
        words += p.words;
      }
    }
    return out.join("\n\n");
  };

  const files = [];
  for (let i = 0; i < count; i++) {
    const title = titles[i];
    const folder = pick(FOLDERS);
    const fm = [];
    if (rand() < 0.35) {
      fm.push(`status: ${pick(STATUS)}`);
      fm.push(`tags:\n  - ${pick(TAGS)}\n  - ${pick(TAGS)}`);
      if (rand() < 0.2) fm.push(`aliases:\n  - ${title} alias`);
    }
    const parts = [];
    if (fm.length) parts.push(`---\n${fm.join("\n")}\n---`);
    parts.push(`# ${title}`);
    parts.push(`Links: ${linkTo()}, ${linkTo()} #${pick(TAGS)}`);
    parts.push(body(int(150, 600)));
    if (queryEvery && i % queryEvery === 0) {
      parts.push(`## Related work\n\n\`\`\`query\nfrom: ${folder}\ntag: ${pick(TAGS)}\nsort: title asc\nas: table\nfields: title, status\nlimit: 20\n\`\`\``);
    }
    const rel = `${folder}/${title}.md`;
    files.push({ rel, content: parts.join("\n\n") + "\n" });
  }
  for (let i = 1; i <= longNotes; i++) {
    const title = `Long Read ${i}`;
    const content =
      `# ${title}\n\nA very long note for typing-speed checks. See ${linkTo()} and ${linkTo()}. #reading\n\n` +
      "```query\ntag: todo\nas: list\nlimit: 10\n```\n\n" +
      body(longWords) +
      "\n";
    files.push({ rel: `${LONG_FOLDER}/${title}.md`, content });
  }
  return files;
}

/** Write the generated vault into `dir` (which must be empty or not exist yet). Returns the file count. */
export function writeVault(dir, opts) {
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} is not empty — pick a new folder`);
  const files = generateVault(opts);
  for (const f of files) {
    const p = join(dir, f.rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content);
  }
  return files.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Number(args[i + 1]) : def;
  };
  const out = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  if (!out) {
    console.error("usage: node scripts/gen-vault.mjs <empty-or-new-folder> [--count 5000] [--seed 1]");
    process.exit(1);
  }
  const dir = resolve(out);
  const n = writeVault(dir, { count: flag("count", 5000), seed: flag("seed", 1) });
  console.log(`wrote ${n} notes to ${dir}`);
}
