import type { VaultData } from "./vault";

/** Hand-written markdown for every handbook note. */
const authored: Record<string, string> = {
  welcome: `# Welcome to Inkwell 👋

**Inkwell** is a local-first research workspace: read papers, manage sources,
write linked Markdown notes, do real math, and turn it all into a connected web
of knowledge — without juggling five different apps.

This whole vault *is* the manual. Every note here was written **in Inkwell**, so
reading it also shows the features working.

## Start here

- 🚀 [[Quick Start]] — the two-minute tour
- ⌨️ [[Keyboard Shortcuts]] — work at the speed of thought
- ✍️ [[Markdown Basics]] — how writing works

## What you can do

- **Write & connect** — [[Markdown Basics]], [[Linking Notes]] and [[Embedding Notes]]
- **See structure** — the [[Knowledge Graph]] and the [[Canvas]]
- **Organize** — [[Tags]], [[Properties & Frontmatter]], [[Table View]] and [[Tasks]]
- **Do math** — the [[The Math Engine]] and the visual [[Visual Math Builder]]
- **Research** — the [[PDF Reader & Highlights]] and [[Citations & BibTeX]]

> [!tip]
> Press **Ctrl/Cmd + P** at any time to jump to any note.`,

  "quick-start": `# Quick Start

A whirlwind tour. Try each step as you read.

## 1. Move around

- Click any note in the left **file tree**.
- Press **Ctrl/Cmd + P** to fuzzy-jump to a note by name.
- Switch the centre view with the icon tabs in the sidebar (graph, table, tasks, canvas, math).

## 2. Write a note

- Hit the **＋** button (or **Ctrl/Cmd + N**) to create one.
- Click **Edit**, then type. See [[The Editor]] for the toolbar, slash commands and autocomplete.
- The note's **title follows its first \`#\` heading**.

## 3. Connect it

- Type \`[[\` to link another note — see [[Linking Notes]].
- Watch new links appear in the [[Knowledge Graph]].

## 4. Make it yours

- Toggle **dark mode** and hide panels — see [[Themes, Focus Mode & Motion]].
- Everything you do is saved locally and survives a reload.

Next: [[Keyboard Shortcuts]].`,

  shortcuts: `# Keyboard Shortcuts

Press **?** anywhere (outside a text box) to see this list in-app.

## Navigation

- **Ctrl/Cmd + P** or **+ K** — [[Command Palette]]
- **Alt + ← / →** — back / forward through visited notes
- **Ctrl/Cmd + G** — jump to the [[Knowledge Graph]]

## Notes

- **Ctrl/Cmd + N** — new note
- **Ctrl/Cmd + E** — toggle edit / read
- **Ctrl/Cmd + Z** — undo · **Ctrl/Cmd + Y** — redo
- **Esc** — leave edit mode, then return to the graph

## Editor

- \`[[\` — link a note · \`![[\` — embed a note · \`/\` — slash commands
- \`$ … $\` and \`$$ … $$\` — math (see [[Math in Notes]])

## Layout

- **Ctrl/Cmd + \\\\** — toggle the sidebar
- **Ctrl/Cmd + Shift + \\\\** — toggle the inspector`,

  "markdown-basics": `# Markdown Basics

Notes are plain **Markdown**, rendered live in read mode. Switch to **Edit** to
see the raw text behind any of this.

## Text

\`**bold**\`, \`_italic_\`, \`\\\`inline code\\\`\` and ~~strikethrough~~.

## Lists

- A bullet
- Another, with **nested** items
  - like this

1. Numbered
2. Lists too

## Quotes, callouts & code

> A blockquote for asides and pull-quotes.

Add \`[!type]\` to a quote to make a **callout**:

> [!note]
> Types include note, tip, info, success, question, warning, danger, example and quote.

> [!warning] Heads up
> Callouts can have a custom title, too.

\`\`\`js
// fenced code keeps its formatting
const hi = "hello";
\`\`\`

## Tables

| Feature | Shortcut |
| --- | --- |
| New note | Ctrl/Cmd + N |
| Palette | Ctrl/Cmd + P |

## And more

Headings (\`#\` … \`###\`) build the outline, \`---\` is a divider, and you can drop in
[[Math in Notes|math]], [[Linking Notes|links]] and [[Embedding Notes|embeds]].

See the full [[Markdown Cheat Sheet]].`,

  "the-editor": `# The Editor

Click **Edit** on any note (or **Ctrl/Cmd + E**) to open the writing surface.

## The toolbar

Buttons for heading, **bold**, _italic_, inline code, lists, quote and links —
each wraps your selection or the current line.

## Type-ahead helpers

- **\`[[\`** opens a fuzzy note picker — keep typing, then **Enter** to insert a [[Linking Notes|link]].
- **\`![[\`** does the same but **embeds** the note — see [[Embedding Notes]].
- **\`/\`** opens **slash commands**: headings, lists, checklists, tables, code blocks, dividers and more.

## Live everything

As you type, the note title syncs to your first \`#\` heading, the [[Knowledge Graph]]
re-wires from your links, and [[Tags]] and [[Properties & Frontmatter|properties]] update.

Edits are undoable with **Ctrl/Cmd + Z**.`,

  wikilinks: `# Linking Notes

Links are the heart of Inkwell. Wrap a note's title in double brackets:

- \`[[Quick Start]]\` → [[Quick Start]]
- Give it a different label with a pipe: \`[[Quick Start|the tour]]\` → [[Quick Start|the tour]]

While editing, type \`[[\` and a fuzzy picker appears — choose a note and it's
inserted for you.

## Why it matters

Every link is an edge in the [[Knowledge Graph]]. The **inspector** on the right
shows a note's outgoing **Links To** and its **Backlinks** (who points here), so
you can navigate in both directions.

Links are parsed from your text, so deleting a \`[[link]]\` removes the connection
automatically.

Next: pull a whole note inline with [[Embedding Notes]].`,

  embeds: `# Embedding Notes

An **embed** drops the full content of another note right inside this one. Use a
\`!\` before a wikilink:

- \`![[Note Title]]\` embeds the whole note
- \`![[Note Title#Heading]]\` embeds just that section

Here's a live embed of the Tags note:

![[Tags]]

Embeds update when the source changes, and they're recursive (with a loop guard),
so you can compose notes from reusable pieces. Compare with a plain
[[Linking Notes|link]] when you only want a pointer, not the content.`,

  tags: `# Tags

Drop a \`#tag\` anywhere in a note to label it: #handbook #organize.

## Where tags show up

- As pills in the **inspector** — click one to search every note with that tag.
- In the [[Table View]] as a column.
- Counted on the **Overview** dashboard.

Tags are great for cross-cutting themes that don't fit the folder tree, like
#todo, #idea or #reference. See also [[Search]] and [[Properties & Frontmatter]].`,

  properties: `# Properties & Frontmatter

A note can carry structured **properties** in a YAML block at the very top,
between \`---\` fences:

\`\`\`
---
type: note
status: draft
authors: Ada Lovelace
year: 1843
---
\`\`\`

Inkwell parses that block, hides it from the rendered body, and shows it as the
**properties panel** at the top of the note (the row of icons you see above this
text). Click any value to **edit it inline**.

Properties power the [[Table View]] — every key becomes a sortable column — and
feed [[Citations & BibTeX|citations]] for source notes.`,

  "math-in-notes": `# Math in Notes

Inkwell renders LaTeX with KaTeX and can compute live values from the
[[The Math Engine|Math Engine]].

## Static math

Inline with single dollars: $E = mc^2$. Block math with double dollars:

$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$

## Live values from the engine

Reference any variable you defined in the [[The Math Engine]] with double braces:

- \`{{area}}\` → {{area}}
- \`{{area:tex}}\` shows the formula instead of the value.

## Live calculations

A fenced \`math\` block evaluates in place, inheriting the engine's variables:

\`\`\`math
mass = 70 kg
height = 1.75 m
bmi = mass / height^2
\`\`\`

## Embedded plots

A \`plot\` block draws functions — see [[Plotting & Parameters]]:

\`\`\`plot
sin(x)/x @ -10..10
\`\`\``,

  "vault-tree": `# Your Vault & File Tree

The left sidebar is your **vault** — every note, grouped into folders. This
handbook uses folders like *00 - Start Here* and *01 - Writing*.

## Working with the tree

- Click a folder's chevron to expand or collapse it.
- Click a note to open it; **right-click** for actions (open in a new tab, pin,
  add to canvas, copy a link, delete).
- The **＋** buttons create notes; the toolbar also opens a PDF (see [[PDF Reader & Highlights]]).

Frequently-used notes can be [[Pins|pinned]] to the top, and you can find anything
fast with [[Search]] or the [[Command Palette]].`,

  search: `# Search

Click the **search** tab (the magnifier) in the sidebar to search the whole vault
by title *and* body. Matches show a highlighted snippet; click to open.

For jumping to a note by name as fast as possible, use the [[Command Palette]]
instead (**Ctrl/Cmd + P**).

Clicking a #tag anywhere also runs a tag search — see [[Tags]].`,

  "command-palette": `# Command Palette

Press **Ctrl/Cmd + P** (or **+ K**) to open the palette: a fuzzy, keyboard-driven
jump-to-anything.

- Type part of a note's name — even non-consecutive letters.
- **↑ / ↓** to move, **Enter** to open, **Esc** to close.

It's the fastest way to navigate a large vault. For full-text search across note
*bodies*, use [[Search]]. The full shortcut list lives in [[Keyboard Shortcuts]].`,

  tabs: `# Tabs & Split View

Notes open as **tabs** along the top of the editor, so you can keep several open
at once.

- **Right-click** a note → *Open in new tab* or *Open to the side*.
- *Open to the side* splits the editor into **two panes** — read a source on the
  left while you write on the right.
- Drag the divider between panes to resize; click a pane to make it active.

Pairs well with the [[PDF Reader & Highlights|PDF reader]] and [[The Editor]].`,

  pins: `# Pinned Notes & History

## Pins

Right-click any note → **Pin to top**. Pinned notes appear in a dedicated
**Pinned** section at the top of the [[Your Vault & File Tree|file tree]] for
one-click access. Unpin the same way.

## History

Inkwell remembers the notes you visit. Use the **← / →** arrows in the title bar
(or **Alt + ← / →**) to step back and forward, just like a browser. See
[[Keyboard Shortcuts]].`,

  "knowledge-graph": `# Knowledge Graph

The graph (the *share-nodes* tab, or **Ctrl/Cmd + G**) draws every note as a dot
and every [[Linking Notes|link]] as a line. Bigger dots = more connections.

## Interacting

- **Drag** a node to rearrange · **scroll** to zoom · **drag the background** to pan.
- **Hover** a node to spotlight its neighbours.
- **Click** to select (the inspector follows); **double-click** to open the note.

## Controls

- **Local** — show only the selected note and its neighbourhood.
- **Color** — tint nodes by folder, with a legend.
- **Fit** — frame everything.

For a freeform spatial board instead, see the [[Canvas]].`,

  "table-view": `# Table View

The **table** tab is a database of your notes — think spreadsheet meets vault.

- Columns are pulled from [[Properties & Frontmatter|properties]] plus computed
  values (link count, [[Tags]]).
- **Click a header** to sort; click again to reverse.
- **Filter** with the search box.
- Click a row to open the note.

It's the quickest way to get an overview, find drafts, or sort sources by year.`,

  tasks: `# Tasks

Any checklist item in any note becomes a tracked task. Write them with
\`- [ ]\` (open) and \`- [x]\` (done):

- [x] Read [[Welcome to Inkwell]]
- [ ] Skim the [[Quick Start]]
- [ ] Write your first note

The **tasks** tab gathers every checkbox across the whole vault, grouped by note,
with open/done counts. Tick a box there and it updates the source note. Toggle
*Show done* to review what you've finished.`,

  canvas: `# Canvas

The **canvas** tab is an infinite, freeform whiteboard.

- **Add to canvas** from a note's right-click menu, or *Add selected*.
- **Drag** cards to arrange them; **scroll** to zoom; **drag the background** to pan.
- Cards that are [[Linking Notes|linked]] are joined automatically with edges.
- **Double-click** a card to open the note.

Use it to lay out an argument, plan a paper, or cluster ideas spatially — a
complement to the more automatic [[Knowledge Graph]].`,

  "math-engine": `# The Math Engine

Open the **ƒ Math Engine** tab for a live computational notebook, powered by
[[math.js (de Jong, 2013)|math.js]].

## How it works

Type definitions in the left sheet; results appear live on the right, with a
shared scope so each line can use the ones above:

- \`r = 5\`
- \`area = pi * r^2\`
- Units: \`5 km/h to m/s\` · Matrices: \`det([1,2;3,4])\` · Symbolic: \`derivative("x^2", "x")\`

## Reuse anywhere

- Every symbol is a chip you can **copy** in many formats.
- Drop a value into a note with \`{{name}}\` — see [[Math in Notes]].

Prefer tapping to typing? Use the [[Visual Math Builder]]. To graph functions,
see [[Plotting & Parameters]]. Full list of functions: [[Math Function Reference]].`,

  "math-builder": `# Visual Math Builder

In the [[The Math Engine|Math Engine]], flip the header toggle from **Sheet** to
**Builder** for a no-typing, calculator-style input.

- Tap the **keypad** — digits, operators, \`sin\`/\`cos\`/\`tan\`, roots, powers,
  factorial, constants (π, e) and more.
- Your keyboard works too: type, use the **numpad**, **Backspace** and arrow keys.
- **Click anywhere in the line** to place the caret.
- The expression renders as pretty math and is **solved live** — the result only
  appears once it's complete and valid.

Save a solved problem straight to a new note, or copy it as LaTeX.`,

  plotting: `# Plotting & Parameters

The [[The Math Engine|Math Engine]] graphs functions of \`x\`.

## Plots

Add a plot like \`sin(x)/x\` and set its range. Each curve has a **draggable point**
— grab it and slide along the curve to read off its \`(x, y)\`.

## Parameters

Add slider-backed **variables** (like \`k\` or \`amp\`) and reference them in a plot,
e.g. \`amp * sin(k * x)\`. Drag a slider and every result and curve updates live.

## In notes

Embed a snapshot anywhere with a \`plot\` block — see [[Math in Notes]]:

\`\`\`plot
cos(x) @ -6.28..6.28
\`\`\``,

  "pdf-reader": `# PDF Reader & Highlights

Inkwell reads PDFs so your sources live beside your notes.

## Open a PDF

Use the **import** icon in the file-tree toolbar (or the reader's empty state) to
pick a PDF. Navigate pages and zoom from the toolbar.

## Highlight → note

**Select text** in the PDF and hit **Save highlight**. Inkwell creates a linked
note in a *Highlights* folder, quoting the passage with its source and page — so a
quote is one click from becoming part of your [[Knowledge Graph]].

Pair it with [[Tabs & Split View|split view]] to read and write at once, and with
[[Citations & BibTeX]] to track the source.`,

  citations: `# Citations & BibTeX

Turn a note into a **source** by giving it citation [[Properties & Frontmatter|properties]]
(\`authors\`, \`year\`, \`venue\`, \`citekey\`). The notes under *Sources* are examples.

## Cite inline

Reference a source by its citekey with \`[@key]\`. It renders as an author-year
link to the source note:

- Markdown was created by Gruber [@gruber2004].
- Math rendering uses KaTeX [@katex2014]; computation uses math.js [@mathjs2013].

## Bibliography

The **References** section in the inspector lists every source this note cites,
with a **Copy BibTeX** button for your reference manager.

See also the [[PDF Reader & Highlights]] for capturing quotes.`,

  "src-markdown": `# Markdown

The lightweight markup language Inkwell notes are written in — plain text that
reads naturally and renders to rich formatting. See [[Markdown Basics]].`,

  "src-katex": `# KaTeX

A fast, self-contained library for rendering TeX math in the browser. Inkwell
uses it for all formula display — see [[Math in Notes]].`,

  "src-mathjs": `# math.js

An extensive math library for JavaScript: expression parsing, big numbers, units,
matrices and symbolic algebra. It powers [[The Math Engine]].`,

  "markdown-cheatsheet": `# Markdown Cheat Sheet

| You type | You get |
| --- | --- |
| \`# Heading\` | a heading (H1–H3 build the outline) |
| \`**bold**\` | **bold** |
| \`_italic_\` | _italic_ |
| \`\\\`code\\\`\` | inline code |
| \`- item\` | a bullet list |
| \`1. item\` | a numbered list |
| \`- [ ] task\` | a [[Tasks|checkbox]] |
| \`> quote\` | a blockquote |
| \`[[Note]]\` | a [[Linking Notes|link]] |
| \`![[Note]]\` | an [[Embedding Notes|embed]] |
| \`#tag\` | a [[Tags|tag]] |
| \`$x^2$\` | inline [[Math in Notes|math]] |
| \`---\` | a divider |

Back to [[Markdown Basics]].`,

  "math-functions": `# Math Function Reference

A taste of what the [[The Math Engine|Math Engine]] understands (via math.js):

- **Arithmetic** — \`+ - * / ^\`, \`mod\`, \`!\` (factorial)
- **Trig** — \`sin cos tan\`, \`asin acos atan\`, plus \`sinh cosh tanh\`
- **Roots & logs** — \`sqrt\`, \`cbrt\`, \`nthRoot\`, \`log\`, \`log10\`, \`ln\`, \`exp\`
- **Rounding** — \`round\`, \`floor\`, \`ceil\`, \`abs\`, \`sign\`
- **Stats** — \`mean\`, \`median\`, \`std\`, \`min\`, \`max\`, \`sum\`
- **Symbolic** — \`derivative("x^2", "x")\`, \`simplify("2x + 3x")\`
- **Units** — \`5 km/h to m/s\` · **Matrices** — \`[1,2;3,4]\`, \`det\`, \`inv\`
- **Constants** — \`pi\`, \`e\`, \`tau\`, \`i\`

Use them in the sheet, the [[Visual Math Builder|Builder]], or \`{{refs}}\` in notes.`,

  themes: `# Themes, Focus Mode & Motion

## Light & dark

Toggle the theme from the **sun / moon** button in the title bar. Your choice is
remembered.

## Focus mode

Hide the panels to write distraction-free:

- **Ctrl/Cmd + \\\\** — toggle the sidebar
- **Ctrl/Cmd + Shift + \\\\** — toggle the inspector
- The title-bar panel buttons do the same.

## Motion

Inkwell animates throughout — eased scrolling, a graph that blooms in, smooth
view transitions — and it all respects your system's *reduced motion* setting.

Everything (theme, layout, pane widths) persists across reloads. Back to
[[Keyboard Shortcuts]].`,
};

const lead = (title: string, area: string) =>
  `> _Stub note._ **${title}** lives in the **${area}** area of this vault.\n\n` +
  `Open it with the **Edit** button to start writing.`;

/** Derive a couple of #tags for a note from its folder area + kind. */
function tagsFor(note: { folder: string; kind: string; title: string }): string {
  const area = note.folder ? note.folder.split("/")[0].replace(/^\d+\s*-\s*/, "") : "vault";
  const areaTag = area.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
  const tags = [`#${areaTag || "vault"}`];
  if (note.kind === "source") tags.push("#source");
  return tags.join(" ");
}

interface SourceMeta {
  authors: string;
  year: string;
  citekey: string;
  venue: string;
}
const sourceMeta: Record<string, SourceMeta> = {
  "src-markdown": { authors: "John Gruber", year: "2004", citekey: "gruber2004", venue: "Daring Fireball" },
  "src-katex": { authors: "Khan Academy", year: "2014", citekey: "katex2014", venue: "GitHub" },
  "src-mathjs": { authors: "Jos de Jong", year: "2013", citekey: "mathjs2013", venue: "GitHub" },
};
export { sourceMeta };
export type { SourceMeta };

/** A leading YAML frontmatter block of structured properties. */
function frontmatterFor(
  note: { id: string; folder: string; kind: string; title: string },
  written: boolean,
): string {
  const area = note.folder ? note.folder.split("/")[0].replace(/^\d+\s*-\s*/, "") : "Vault";
  const type = note.kind === "source" ? "source" : "note";
  const lines = [`type: ${type}`, `area: ${area}`, `status: ${written ? "written" : "stub"}`];
  const sm = sourceMeta[note.id];
  if (sm) lines.push(`authors: ${sm.authors}`, `year: ${sm.year}`, `venue: ${sm.venue}`, `citekey: ${sm.citekey}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

/** Build a markdown string for every note (authored, or a templated stub). */
export function buildContents(vault: VaultData): Record<string, string> {
  const titleOf = new Map(vault.notes.map((n) => [n.id, n.title]));
  const out: Record<string, string> = {};

  for (const note of vault.notes) {
    if (authored[note.id]) {
      out[note.id] = `${frontmatterFor(note, true)}${authored[note.id]}\n\n---\n\n${tagsFor(note)}`;
      continue;
    }
    const area = note.folder ? note.folder.split("/")[0].replace(/^\d+\s*-\s*/, "") : vault.name;
    const related = note.links
      .map((id) => titleOf.get(id))
      .filter(Boolean)
      .map((t) => `- [[${t}]]`)
      .join("\n");

    out[note.id] = [
      frontmatterFor(note, false) + `# ${note.title}`,
      "",
      lead(note.title, area),
      "",
      "## Related notes",
      related || "_No links yet._",
      "",
      "---",
      "",
      tagsFor(note),
      "",
    ].join("\n");
  }
  return out;
}
