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

- **Write & connect** — [[Markdown Basics]], [[Linking Notes]], [[Embedding Notes]], [[Callouts]] and [[Code & Syntax Highlighting]]
- **See structure** — the [[Knowledge Graph]], the immersive [[Constellation View]], the [[Canvas]] and the infinite [[Whiteboard]]
- **Organize** — [[Tags]], [[Properties & Frontmatter]], [[Table View]], [[Tasks]], the [[Kanban Board]] and [[Saved Searches]]
- **Do math** — the [[The Math Engine]] and the visual [[Visual Math Builder]]
- **Research** — the [[PDF Reader & Highlights]], the [[Web Clipper]] and [[Citations & BibTeX]]
- **Capture & review** — [[Quick Capture]], [[Daily Notes]] and [[Flashcards & Review]]
- **Ask** — the [[The AI Assistant]] answers questions about your whole vault

## Learn by example

Browse the **08 - Examples** folder for realistic, ready-made notes: a
[[Example — Research Project|research project]], a [[Example — Meeting Notes|meeting]],
a [[Example — Recipe Card|recipe]], a [[Example — Code Snippets|code gallery]],
a [[Example — Physics Worksheet|physics worksheet]] and more.

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

## Diagrams

A \`mermaid\` code block renders a diagram:

\`\`\`mermaid
graph LR
  A[Write a note] --> B[Link it]
  B --> C[See the graph]
  C --> A
\`\`\`

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

## Aliases

Give a note alternate names with an \`aliases\` property, and \`[[link]]\` it (or
find it in the palette) under any of them. This note answers to \`[[links]]\` and
\`[[wikilink]]\` too.

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
#todo, #idea or #reference.

## Nested tags

Use slashes to nest: #guide/writing and #guide/research group under *guide* in
the **tag explorer** (open the Search tab with an empty query to browse them).

See also [[Search]] and [[Properties & Frontmatter]].`,

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

## Flashcards

Write \`Question :: Answer\` on a line and it becomes a review card in the
**Flashcards** tab. A few to try:

What turns a quote into a callout :: adding [!type]
How do you embed a note :: with ![[Note]]
What renders inline math :: single dollar signs

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

  appearance: `# Appearance & Accent Colors

Open the **palette** button in the title bar for the appearance menu.

## Theme & focus

- **Light / Dark** — switch the whole workspace; your choice is remembered.
- **Focus** — enter distraction-free [[Themes, Focus Mode & Motion|zen mode]] (also **Ctrl/Cmd + .**), which hides every panel and centres your writing. Press **Esc** to leave.

## Accent color

Pick from ten accent swatches — purple, blue, sky, green, amber, red, pink, teal, indigo, or the default. The accent re-tints buttons, links, the active note, callouts and the assistant throughout the app, instantly and persistently.

> [!tip]
> Pair a warm accent with dark mode for a cosy late-night writing feel.

See also [[Themes, Focus Mode & Motion]].`,

  callouts: `# Callouts

A **callout** is a blockquote with a \`[!type]\` marker on its first line. It draws a coloured, icon-tagged box — perfect for asides, warnings and tips.

\`\`\`
> [!tip]
> This is a tip callout.
\`\`\`

## Every type

> [!note]
> A neutral note for general remarks.

> [!tip]
> A helpful tip or shortcut.

> [!info]
> Background information worth knowing.

> [!success]
> Something went right.

> [!question]
> An open question to revisit.

> [!warning]
> Proceed with caution.

> [!danger]
> A serious pitfall — don't do this.

> [!example]
> A worked example.

> [!quote]
> "A callout can hold a quotation, too."

## Custom titles

Put text after the type to set a custom heading:

> [!warning] Save your work first
> The body wraps onto the following quote lines.

Callouts are great in [[Templates|templates]] and worked notes like the [[Example — Decision Log]]. Full syntax in the [[Markdown Cheat Sheet]].`,

  "code-blocks": `# Code & Syntax Highlighting

Fence a block with triple back-ticks and a language tag, and Inkwell colours it with proper **syntax highlighting** in read mode.

## Example

\`\`\`python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print([fib(i) for i in range(10)])
\`\`\`

The highlighter is **lazy-loaded** — it only downloads the first time a note actually contains a code block, so notes without code stay feather-light.

## Tips

- Tag the language (\`js\`, \`python\`, \`rust\`, \`sql\`, \`bash\`, \`json\`…) for the best colours.
- Inline code uses single back-ticks: \`like this\`.
- Colours adapt to [[Themes, Focus Mode & Motion|light and dark]] themes.

See a whole gallery in [[Example — Code Snippets]].`,

  images: `# Images & Attachments

## Paste an image

Copy any image to your clipboard and **paste** (Ctrl/Cmd + V) directly into the editor — Inkwell embeds it inline and it renders immediately in read mode. Screenshots, diagrams and photos all work.

## Markdown image syntax

\`\`\`
![alt text](https://example.com/picture.png)
\`\`\`

Pasted images are stored with the note, so they travel with your vault and survive reloads.

## From the web

Grabbing a whole page? The [[Web Clipper]] saves a clean copy with its images linked. To capture a quote from a paper, use the [[PDF Reader & Highlights]].`,

  templates: `# Templates

Stop re-typing the same scaffolding. The **template** button in the file-tree toolbar creates a new note pre-filled with a structure.

## Built-in templates

- **Meeting** — attendees, agenda, notes, action items → see [[Example — Meeting Notes]]
- **Literature note** — source, summary, key points, quotes → see [[Example — Literature Note]]
- **Project** — goal, milestones, tasks, links
- **Cornell** — cue / notes / summary study layout
- **Daily** — today's plan and log → see [[Daily Notes]]

## Make your own

Any note can be a starting point — duplicate it (right-click → **Duplicate**) and clear the specifics. Combine templates with [[Properties & Frontmatter|properties]], [[Tasks]] and [[Callouts]] for a powerful, repeatable workflow.`,

  "find-replace": `# Find & Replace

While editing a note, press **Ctrl/Cmd + F** to open the find bar.

- Type in **Find** and press **Enter** (or **Next**) to jump to each match.
- Type in **Replace** and use **Replace** for one match or **All** for every match.
- Matching is case-insensitive.
- Press **Esc** to close and return to writing.

It operates on the current note's text — fast for renaming a term, fixing a typo everywhere, or reformatting. For searching *across* the whole vault instead, see [[Search]].`,

  "quick-capture": `# Quick Capture

Had a thought mid-task? Press **Ctrl/Cmd + Shift + K** anywhere to pop the **quick-capture** box, jot a line, and hit **Enter**. It's appended to your **Inbox** note (created automatically the first time) without disturbing what you were doing.

> [!tip]
> Capture now, organise later. Triage your Inbox into the [[Your Vault & File Tree|tree]] when you have a moment — drag notes between folders, or split the Inbox into real notes.

Great alongside [[Daily Notes]] and the [[Web Clipper]] for getting everything *into* the vault with zero friction.`,

  "web-clipper": `# Web Clipper

Save a web page as a clean Markdown note. Click the **clip** icon (the arrow-out-of-box) in the file-tree toolbar, paste a URL, and hit **Clip**.

Inkwell fetches a readable version of the page — stripped of ads and clutter — and drops it into a **Clippings** folder with a link back to the source.

## Good for

- Capturing an article to annotate and [[Tags|tag]] later
- Pulling a reference into your [[Knowledge Graph]]
- Building a reading queue (clip now, read in [[Themes, Focus Mode & Motion|focus mode]])

Add citation [[Properties & Frontmatter|properties]] afterwards to fold it into [[Citations & BibTeX]].`,

  "saved-searches": `# Saved Searches

Built a search you keep coming back to? Save it. In the [[Search]] panel, run a query (full-text or a \`#tag\`), then click **★ Save** and give it a name.

Saved searches appear at the top of the Search panel when the box is empty — one click re-runs them, like a **smart folder** that's always up to date.

## Ideas

- \`#todo\` — everything still to do
- \`#idea\` — your idea backlog
- A project codename to gather all related notes

Saved searches persist with your vault. See also [[Tags]] and the [[Command Palette]].`,

  whiteboard: `# Whiteboard

The **Whiteboard** tab is an *infinite* canvas for thinking with your hands — sketch, scribble and arrange sticky notes on a boundless surface.

## Tools

- ✏️ **Pen** — freehand draw in any of six colours and three thicknesses.
- 🧽 **Eraser** — rub out strokes.
- ✋ **Pan** — grab and drag the canvas (or use a middle-mouse drag any time).
- 🗒️ **Sticky note** — click to drop a coloured note; type in it, drag its header to move, drag the corner to resize.

## Moving around

- **Scroll** to zoom in and out (it zooms toward your cursor).
- The zoom indicator resets the view to 100%.
- Pan forever — there are no edges.

Everything you draw is saved automatically. For drawing that becomes a *note*, use the [[Sketch Pad]]; for arranging existing notes spatially, use the [[Canvas]].`,

  constellation: `# Constellation View

Open the [[Knowledge Graph]] and press **✦ Constellation** for a full-screen, cinematic map of your whole vault.

- Notes glow as **stars**, coloured by folder, drifting gently against a starfield.
- Brighter, bigger stars are your most-connected **hub** notes.
- **Drag** to pan, **scroll** to zoom.
- **Hover** a star to light up its links; **click** one to open the note.
- Press **Esc** (or **Close**) to return.

It's the same data as the [[Knowledge Graph]], dressed for exploring — and a rather nice way to rediscover forgotten corners of your vault.`,

  kanban: `# Kanban Board

The **Kanban** tab turns a \`status\` [[Properties & Frontmatter|property]] into a drag-and-drop board. Each column is a status; each card is a note.

\`\`\`
---
status: in progress
---
\`\`\`

## Using it

- **Drag** a card between columns to change its status — the note's property updates instantly.
- Notes without a status sit in a starting column until you move them.
- Combine with [[Tasks]] for checklists inside each card.

Try it on a [[Example — Research Project|project]]: *todo → in progress → review → done*.`,

  "daily-notes": `# Daily Notes

The **Journal** tab is a calendar. Click any day to open (or create) that day's note — a dated page for what happened, what you planned, and stray thoughts.

- Today is highlighted; jump around months freely.
- New daily notes start from a simple plan / log / notes [[Templates|template]].
- Pair with [[Quick Capture]] to dump thoughts in all day, then tidy them into the day's note.

A worked example: [[Example — A Daily Note]].`,

  flashcards: `# Flashcards & Review

Any line written as \`Question :: Answer\` becomes a **flashcard**. The **Flashcards** tab gathers them from across your vault and quizzes you with **spaced repetition** (an SM-2 schedule), so you review each card right before you'd forget it.

What does :: separate on a flashcard line :: the question and the answer
Which algorithm schedules reviews :: SM-2 spaced repetition

## Reviewing

- See the question, think, then reveal the answer.
- Rate yourself **Again / Hard / Good / Easy** — that sets when the card returns.
- Due counts show how many cards are waiting.

Turn any [[Example — Book Notes|book notes]] or study notes into a deck — see the [[Example — Flashcard Deck]].`,

  "sketch-pad": `# Sketch Pad

The **Sketch** tab is a quick freehand pad — draw a diagram, sign something, or doodle an idea — then **Save as note** to drop the drawing into your vault as an inline SVG you can link and embed.

- Pen colours and sizes, plus an eraser and undo.
- **Clear** to start over.
- Saved sketches live in a *Sketches* folder.

For an endless, pannable surface with sticky notes, use the [[Whiteboard]]; for laying out existing notes, the [[Canvas]].`,

  "ai-assistant": `# The AI Assistant

Press **Ctrl/Cmd + J** (or the **✦** in the title bar) to open the assistant — a chat panel that answers questions about *your* vault.

## How it's different

It doesn't read your entire vault on every question. Instead it's handed a compact **map** of every note — titles, folders, tags and the link graph — and uses that to decide which few notes to actually open. You'll see it work: *searching… following links… reading…* Then it answers, **citing the notes it used** as clickable [[Linking Notes|links]].

That graph-guided approach keeps it fast and cheap — it reads two or three notes, not three hundred.

## What it can do

- **Answer** questions, summarise, compare and connect ideas across notes.
- **Summarise this note** — the **Ask AI** button on any note (or right-click → *Ask AI about this*).
- **Write**, if you allow it — toggle the ✏️ button and it can *propose* new notes or edits. Nothing is saved until you **approve** each change.

Every reply shows the time taken and tokens used. Set it up in [[AI Providers & Keys]].`,

  "ai-providers": `# AI Providers & Keys

The assistant talks to a model **you** choose, with **your** API key — stored only in this browser, never uploaded. Open the key manager from the 🎨 icon in the assistant panel.

Twelve providers are built in, each with its full current model lineup — pick the active provider **and** model in the panel.

## Free (recommended)

- **Groq** — free, no credit card, very fast (Llama 3.3 70B, Llama 4, GPT-OSS…). The easiest start.
- **Cerebras** — free tier, wafer-scale speed.
- **Google Gemini** — generous free tier (2.5 Flash/Pro, 2.0, 1.5…), great at tool use.
- **Mistral** — European models with a free tier.
- **OpenRouter** — one key, 300+ models, many \`:free\`.

## Local — no key, fully private

- **Ollama** — runs models on *your* machine (Llama, Qwen, Mistral, Phi, DeepSeek). Free, offline, no key. Install Ollama, run \`ollama serve\` (set \`OLLAMA_ORIGINS=*\` so the browser can reach it).

## Paid

- **Anthropic (Claude)** — Opus / Sonnet / Haiku, top quality for vault reasoning.
- **OpenAI** — GPT-4o, GPT-4.1, o3 / o4-mini.
- **DeepSeek** — very cheap, strong reasoning (R1).
- **xAI (Grok)**, **Together AI** (open models), **Perplexity** (web-connected). If a free model hits a rate limit, the assistant waits and retries automatically; smaller models fall back to a one-shot answer. Back to [[The AI Assistant]].`,

  "ex-research": `---
type: project
area: Examples
status: in progress
started: 2026-05-01
lead: You
---

# Example — Research Project

A realistic project hub. Notice the **properties** above (drag this onto the [[Kanban Board]] — its \`status\` makes it a card), the [[Tasks|task list]], and links out to sources.

## Goal

Understand how plain-text knowledge tools keep notes connected, and write a short literature review.

## Milestones

- [x] Collect 5 core sources
- [x] Write one [[Example — Literature Note|literature note]] per source
- [ ] Draft the synthesis
- [ ] Revise and cite everything

## Open questions

> [!question]
> Does linking density actually improve recall, or just *feel* productive?

## Sources

- [[Markdown (Gruber, 2004)]]
- [[KaTeX (Khan Academy, 2014)]]
- [[math.js (de Jong, 2013)]]

## Notes

Foundational work on lightweight markup [@gruber2004] underpins everything here. See the matching [[Example — Literature Note]].

#research #example`,

  "ex-literature": `---
type: literature
area: Examples
status: written
authors: John Gruber
year: 2004
citekey: gruber2004
---

# Example — Literature Note

A template for distilling one source. Source metadata lives in the **properties** above; the inspector turns the citation into a [[Citations & BibTeX|bibliography]] entry.

## One-line summary

Markdown is a plain-text formatting syntax designed to be readable as-is and convertible to HTML.

## Key points

- **Readability first** — the raw text should look fine unrendered.
- Maps cleanly to a subset of HTML.
- Deliberately small; complex layout falls back to literal HTML.

## Notable quote

> "The idea is that a Markdown-formatted document should be publishable as-is, as plain text."

## My take

This is exactly why a vault of \`.md\` files ages well. Connects to [[Markdown Basics]] and the parent [[Example — Research Project]].

Cited as [@gruber2004].

#research #example`,

  "ex-meeting": `---
type: meeting
area: Examples
date: 2026-06-12
attendees: You, Ada, Linus
status: done
---

# Example — Meeting Notes

Made with the **Meeting** [[Templates|template]].

## Agenda

1. Review last week's [[Tasks|action items]]
2. Decide on the note structure
3. Next steps

## Discussion

- Agreed the vault should be self-documenting (this handbook is the proof).
- Ada prefers [[Tags|tags]] over deep folders; Linus wants both.

## Decisions

> [!success]
> Ship the examples folder. Track structure choices in a [[Example — Decision Log|decision log]].

## Action items

- [ ] You — draft the examples
- [ ] Ada — review tags taxonomy
- [x] Linus — set up the [[Kanban Board]]

#example`,

  "ex-book": `---
type: book
area: Examples
authors: Italo Calvino
year: 1972
rating: 5/5
status: finished
---

# Example — Book Notes

Reading notes that double as a study deck (those \`::\` lines become [[Flashcards & Review|flashcards]]).

## Summary

A traveller describes cities to an emperor; each city is really a meditation on memory, desire and signs.

## Highlights

> "The city does not tell its past, but contains it like the lines of a hand."

- Cities as **mirrors** of inner states.
- Description as a way of *seeing*, not just recording.

## Review cards

Who wrote Invisible Cities :: Italo Calvino
What does each city really describe :: an aspect of memory, desire or signs
What year was it published :: 1972

Linked from [[Linking Notes]]; deck lives in [[Example — Flashcard Deck]].

#example`,

  "ex-recipe": `---
type: recipe
area: Examples
servings: 2
time: 20 min
status: done
---

# Example — Recipe Card

Structured properties (\`servings\`, \`time\`) plus a tidy ingredients table.

## Ingredients

| Item | Amount |
| --- | --- |
| Spaghetti | 200 g |
| Eggs | 2 |
| Pecorino | 50 g |
| Guanciale | 80 g |
| Black pepper | to taste |

## Method

1. Boil the pasta in well-salted water.
2. Crisp the guanciale in a cold pan brought up to heat.
3. Whisk eggs with the grated pecorino and lots of pepper.
4. Toss drained pasta off the heat with the fat, then the egg mix — add pasta water until silky.

> [!tip]
> Off the heat for the eggs, always — otherwise scramble city.

#example`,

  "ex-trip": `---
type: trip
area: Examples
destination: Lisbon
dates: 2026-09-10 to 2026-09-15
status: todo
---

# Example — Trip Plan

Itinerary as a table, packing as [[Tasks]]. The \`status: todo\` shows up on the [[Kanban Board]].

## Itinerary

| Day | Plan |
| --- | --- |
| Fri | Arrive, Alfama at sunset |
| Sat | Belém — pastéis & the tower |
| Sun | Sintra day trip |
| Mon | Tram 28, LX Factory |
| Tue | Time Out Market, fly home |

## Packing

- [ ] Passport & cards
- [ ] Adapter (Type F)
- [ ] Light jacket
- [ ] Comfortable shoes

## Budget snapshot

A quick figure embeds from the [[The Math Engine]]: \`{{area}}\` (swap for your own variable).

#example`,

  "ex-code": `# Example — Code Snippets

A gallery showing off [[Code & Syntax Highlighting|syntax highlighting]] across languages. Switch to [[Themes, Focus Mode & Motion|dark mode]] to see the colours adapt.

## JavaScript

\`\`\`js
const greet = (name) => "Hello, " + name + "!";
[1, 2, 3].map((n) => n ** 2).forEach((x) => console.log(x));
\`\`\`

## Python

\`\`\`python
from functools import lru_cache

@lru_cache
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)
\`\`\`

## Rust

\`\`\`rust
fn main() {
    let xs: Vec<i32> = (1..=5).map(|x| x * x).collect();
    println!("{:?}", xs);
}
\`\`\`

## SQL

\`\`\`sql
select folder, count(*) as notes
from vault
group by folder
order by notes desc;
\`\`\`

## Shell

\`\`\`bash
# count words across the vault
find . -name '*.md' -exec wc -w {} + | tail -1
\`\`\`

Back to [[Code & Syntax Highlighting]].`,

  "ex-diagrams": `# Example — Diagram Gallery

\`mermaid\` code blocks render as live diagrams. A few flavours:

## Flowchart

\`\`\`mermaid
graph TD
  Idea --> Note
  Note -->|link| Note2[Another note]
  Note2 --> Graph[Knowledge Graph]
  Graph --> Idea
\`\`\`

## Sequence

\`\`\`mermaid
sequenceDiagram
  You->>Assistant: Ask a question
  Assistant->>Vault: search + read a few notes
  Vault-->>Assistant: relevant passages
  Assistant-->>You: cited answer
\`\`\`

## Mind map

\`\`\`mermaid
mindmap
  root((Vault))
    Writing
      Markdown
      Links
    Views
      Graph
      Whiteboard
    Research
      PDFs
      Citations
\`\`\`

More markdown in [[Markdown Basics]].`,

  "ex-physics": `# Example — Physics Worksheet

The [[The Math Engine|Math Engine]] computes inline. These \`math\` blocks evaluate live, sharing variables top-to-bottom.

## Projectile range

\`\`\`math
v = 20 m/s
angle = 45 deg
g = 9.81 m/s^2
range = v^2 * sin(2 * angle) / g
\`\`\`

## Kinetic energy

\`\`\`math
mass = 2 kg
speed = 3 m/s
KE = 0.5 * mass * speed^2
\`\`\`

## A curve to ponder

The damped wave, plotted over one window:

\`\`\`plot
exp(-x/5) * cos(2*x) @ 0..15
\`\`\`

Want sliders and draggable points? Build it in the [[Plotting & Parameters|plotter]]. Reference: [[Math Function Reference]].`,

  "ex-flashcards": `# Example — Flashcard Deck

Every \`Question :: Answer\` line below is a card in the [[Flashcards & Review|Flashcards]] tab. A world-capitals deck:

What is the capital of France :: Paris
What is the capital of Japan :: Tokyo
What is the capital of Australia :: Canberra
What is the capital of Canada :: Ottawa
What is the capital of Brazil :: Brasília
What is the capital of Egypt :: Cairo
What is the capital of Norway :: Oslo
What is the capital of Kenya :: Nairobi

> [!tip]
> Keep questions atomic — one fact per card reviews far better.

Make a deck from any notes, like the [[Example — Book Notes]].`,

  "ex-daily": `# Example — A Daily Note

What the [[Daily Notes|Journal]] creates for a day. Capture freely with **Ctrl/Cmd + Shift + K**.

## Plan

- [x] Write the examples folder
- [ ] Review the [[Example — Research Project]]
- [ ] Walk, 30 min

## Log

- 09:10 — deep work on the handbook
- 11:30 — coffee, skimmed a [[Web Clipper|clipped]] article
- 14:00 — pairing on the [[Kanban Board]]

## Notes

Idea: a weekly review that rolls up each day's open [[Tasks]]. #idea

#example`,

  "ex-decision": `---
type: decision
area: Examples
status: accepted
date: 2026-06-20
---

# Example — Decision Log

A lightweight ADR (architecture decision record). Properties show status at a glance.

## Context

We need a way to organise notes that scales past a few hundred.

## Options considered

1. Deep folders only
2. Flat vault + [[Tags]] + [[Saved Searches]]
3. A hybrid: shallow folders **and** tags

## Decision

> [!success] Chosen: option 3
> Shallow folders for *where a note lives*, tags for *what it's about*. Cross-cutting views come from [[Saved Searches]] and the [[Knowledge Graph]].

## Consequences

- Easy onboarding (folders are familiar).
- Powerful retrieval (tags + search).
- Some discipline needed to tag consistently.

Tracked from the [[Example — Meeting Notes]].

#example`,

  "ex-project": `---
type: project
area: Examples
status: in progress
owner: You
due: 2026-09-30
progress: 45%
---

# Example — Project Plan

A full project hub. The \`status\` property makes this a card on the [[Kanban Board]]; the checklist feeds the [[Tasks]] view.

## Goal

Ship v1 of the mobile app to the app stores by the end of Q3.

## Phases

\`\`\`mermaid
graph LR
  D[Discovery] --> B[Build]
  B --> T[Test]
  T --> L[Launch]
  L --> M[Measure]
  M -->|iterate| B
\`\`\`

## Milestones

- [x] Discovery & specs signed off
- [x] Design system in Figma
- [ ] Core screens built
- [ ] Beta with 20 testers
- [ ] Store submission

## Risks

> [!warning] Watch the review queue
> App-store review can take a week — submit the beta build early to de-risk launch.

> [!tip]
> Break each milestone into its own note and \`[[link]]\` it back here.

## Links

- Team notes → [[Example — Meeting Notes]]
- Decisions → [[Example — Decision Log]]

#project #example`,

  "ex-course": `---
type: course
area: Examples
course: Linear Algebra
term: Autumn 2026
---

# Example — Course Notes

A **Cornell**-style study note. Cues on the left in your head, notes in the middle, summary at the bottom — plus formulas and review cards.

## Notes

A **matrix** is a rectangular array of numbers. Multiplying a vector by a matrix is a *linear transformation*.

Key identity — the determinant of a 2×2:

$$\\det\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} = ad - bc$$

A transformation is **invertible** exactly when its determinant is non-zero.

> [!info] Cue
> When does a system $Ax = b$ have a unique solution? → when $\\det A \\neq 0$.

## Worked value

A quick numeric check with the [[The Math Engine|Math Engine]]:

\`\`\`math
a = 3
b = 2
c = 1
d = 4
det = a*d - b*c
\`\`\`

## Review cards

What does a determinant of zero mean :: the matrix is singular (not invertible)
Determinant of a 2×2 [[a,b],[c,d]] :: ad − bc
A matrix times a vector is a :: linear transformation

## Summary

Determinants tell you whether a transformation collapses space (0) or is reversible (≠0). Deck lives in [[Example — Flashcard Deck]].

#course #example`,

  "ex-budget": `---
type: budget
area: Examples
month: 2026-07
---

# Example — Monthly Budget

Live numbers with the [[The Math Engine|Math Engine]]. Edit a figure in the \`math\` block and the totals recompute.

## The maths

\`\`\`math
income = 4200
rent = 1350
groceries = 480
transport = 120
utilities = 160
subscriptions = 65
fun = 250
spending = rent + groceries + transport + utilities + subscriptions + fun
savings = income - spending
savings_rate = savings / income * 100
\`\`\`

## Breakdown

| Category | Amount |
| --- | --- |
| Rent | 1,350 |
| Groceries | 480 |
| Transport | 120 |
| Utilities | 160 |
| Subscriptions | 65 |
| Fun | 250 |
| **Saved** | **the rest** |

> [!success] Rule of thumb
> Aim to keep \`savings_rate\` above 20%. Above, it's ~30% — comfortable.

> [!tip]
> Duplicate this note each month (right-click → Duplicate) to keep a running history.

#budget #example`,

  "ex-crm": `---
type: crm
area: Examples
---

# Example — Contacts & CRM

A lightweight CRM as a table. Give each contact its own note and link it, or track them all here. Open the [[Table View]] to sort every note by property.

## Pipeline

| Contact | Company | Stage | Next step |
| --- | --- | --- | --- |
| Ada Nwosu | Vellum | Demo booked | Send deck |
| Ravi Patel | Northpeak | Negotiating | Follow up Fri |
| Lena Ortiz | Quanta | Won 🎉 | Kickoff call |
| Sam Cho | Brightline | Cold | Intro email |

## Follow-ups

- [ ] Send Ada the pricing deck
- [ ] Chase Ravi's signature
- [x] Schedule Lena's kickoff
- [ ] Warm intro to Sam via [[Example — Meeting Notes|the team]]

> [!note]
> For a richer record, make one note per contact with \`type: contact\` properties — the [[Table View]] then becomes your CRM board.

#crm #example`,

  "ex-habits": `---
type: tracker
area: Examples
week: 2026-W27
---

# Example — Habit Tracker

Track a week at a glance. Pair it with [[Daily Notes]] to reflect each evening.

## This week

| Habit | M | T | W | T | F | S | S |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Read 20 min | ✅ | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| Exercise | ✅ | ⬜ | ✅ | ✅ | ⬜ | ✅ | ✅ |
| No phone AM | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ | ✅ |
| Journal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ |

## Today's checklist

- [x] Read 20 minutes
- [x] Morning walk
- [ ] Journal before bed

> [!tip] Streaks stick
> Don't break the chain two days running. A single miss is fine — two starts a new habit.

#habits #example`,
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

const aliasesFor: Record<string, string[]> = {
  wikilinks: ["links", "wikilink"],
  "the-editor": ["editor"],
  "command-palette": ["palette"],
  "math-engine": ["math", "calculator"],
  "knowledge-graph": ["graph"],
  "ai-assistant": ["ai", "assistant", "chat"],
  whiteboard: ["board"],
  constellation: ["stars"],
  "web-clipper": ["clipper", "clip"],
  "quick-capture": ["inbox", "capture"],
  flashcards: ["cards", "review", "srs"],
};

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
  const aliases = aliasesFor[note.id];
  if (aliases) lines.push("aliases:", ...aliases.map((a) => `  - ${a}`));
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
      const body = authored[note.id];
      // a note may supply its own YAML frontmatter (rich example properties); otherwise add the standard one
      const head = body.startsWith("---\n") ? "" : frontmatterFor(note, true);
      out[note.id] = `${head}${body}\n\n---\n\n${tagsFor(note)}`;
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
