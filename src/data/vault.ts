export type NoteKind = "note" | "source";

export interface Note {
  id: string;
  title: string;
  folder: string; // "/" separated path, "" = vault root
  kind: NoteKind;
  links: string[]; // seed link ids (used to generate starter content)
  content?: string; // markdown body; live links are parsed from this
}

export interface VaultData {
  name: string;
  notes: Note[];
}

const n = (
  id: string,
  title: string,
  folder: string,
  links: string[] = [],
  kind: NoteKind = "note",
): Note => ({ id, title, folder, kind, links });

const START = "00 - Start Here";
const WRITING = "01 - Writing";
const ORGANIZE = "02 - Organizing";
const VIEWS = "03 - Views";
const MATH = "04 - Math";
const RESEARCH = "05 - Research";
const SRC = "05 - Research/Sources";
const REF = "06 - Reference";
const ASSISTANT = "07 - Assistant";
const EXAMPLES = "08 - Examples";

export const vault: VaultData = {
  name: "Inkwell Handbook",
  notes: [
    // 00 - Start Here
    n("welcome", "Welcome to Inkwell", START, [
      "quick-start",
      "markdown-basics",
      "knowledge-graph",
      "math-engine",
      "pdf-reader",
      "shortcuts",
    ]),
    n("quick-start", "Quick Start", START, ["the-editor", "wikilinks", "command-palette", "welcome"]),
    n("shortcuts", "Keyboard Shortcuts", START, ["command-palette", "the-editor", "themes"]),

    // 01 - Writing
    n("markdown-basics", "Markdown Basics", WRITING, ["the-editor", "math-in-notes", "markdown-cheatsheet"]),
    n("the-editor", "The Editor", WRITING, ["markdown-basics", "wikilinks", "embeds"]),
    n("wikilinks", "Linking Notes", WRITING, ["embeds", "knowledge-graph", "the-editor"]),
    n("embeds", "Embedding Notes", WRITING, ["wikilinks", "markdown-basics"]),
    n("tags", "Tags", WRITING, ["search", "table-view"]),
    n("properties", "Properties & Frontmatter", WRITING, ["table-view", "citations"]),
    n("math-in-notes", "Math in Notes", WRITING, ["math-engine", "plotting", "markdown-basics"]),

    // 02 - Organizing
    n("vault-tree", "Your Vault & File Tree", ORGANIZE, ["pins", "search", "welcome"]),
    n("search", "Search", ORGANIZE, ["command-palette", "tags"]),
    n("command-palette", "Command Palette", ORGANIZE, ["search", "shortcuts"]),
    n("tabs", "Tabs & Split View", ORGANIZE, ["vault-tree", "the-editor"]),
    n("pins", "Pinned Notes & History", ORGANIZE, ["vault-tree", "shortcuts"]),

    // 03 - Views
    n("knowledge-graph", "Knowledge Graph", VIEWS, ["wikilinks", "canvas", "welcome"]),
    n("table-view", "Table View", VIEWS, ["properties", "tags"]),
    n("tasks", "Tasks", VIEWS, ["markdown-basics"]),
    n("canvas", "Canvas", VIEWS, ["knowledge-graph"]),

    // 04 - Math
    n("math-engine", "The Math Engine", MATH, ["math-in-notes", "plotting", "math-builder", "math-functions"]),
    n("math-builder", "Visual Math Builder", MATH, ["math-engine"]),
    n("plotting", "Plotting & Parameters", MATH, ["math-engine", "math-in-notes"]),

    // 05 - Research
    n("pdf-reader", "PDF Reader & Highlights", RESEARCH, ["citations"]),
    n("citations", "Citations & BibTeX", RESEARCH, ["pdf-reader", "properties", "src-markdown", "src-katex", "src-mathjs"]),

    // 05 - Research / Sources
    n("src-markdown", "Markdown (Gruber, 2004)", SRC, ["citations"], "source"),
    n("src-katex", "KaTeX (Khan Academy, 2014)", SRC, ["math-in-notes"], "source"),
    n("src-mathjs", "math.js (de Jong, 2013)", SRC, ["math-engine"], "source"),

    // 06 - Reference
    n("markdown-cheatsheet", "Markdown Cheat Sheet", REF, ["markdown-basics"]),
    n("math-functions", "Math Function Reference", REF, ["math-engine"]),
    n("themes", "Themes, Focus Mode & Motion", REF, ["shortcuts", "appearance"]),
    n("appearance", "Appearance & Accent Colors", REF, ["themes"]),

    // 01 - Writing (more)
    n("callouts", "Callouts", WRITING, ["markdown-basics", "markdown-cheatsheet"]),
    n("code-blocks", "Code & Syntax Highlighting", WRITING, ["markdown-basics", "ex-code"]),
    n("images", "Images & Attachments", WRITING, ["the-editor", "web-clipper"]),
    n("templates", "Templates", WRITING, ["the-editor", "daily-notes", "ex-meeting"]),
    n("find-replace", "Find & Replace", WRITING, ["the-editor"]),

    // 02 - Organizing (more)
    n("quick-capture", "Quick Capture", ORGANIZE, ["vault-tree", "search"]),
    n("web-clipper", "Web Clipper", ORGANIZE, ["citations", "images"]),
    n("saved-searches", "Saved Searches", ORGANIZE, ["search", "tags"]),

    // 03 - Views (more)
    n("whiteboard", "Whiteboard", VIEWS, ["canvas", "sketch-pad"]),
    n("constellation", "Constellation View", VIEWS, ["knowledge-graph"]),
    n("kanban", "Kanban Board", VIEWS, ["tasks", "properties"]),
    n("daily-notes", "Daily Notes", VIEWS, ["templates", "ex-daily"]),
    n("flashcards", "Flashcards & Review", VIEWS, ["markdown-cheatsheet", "ex-flashcards"]),
    n("sketch-pad", "Sketch Pad", VIEWS, ["whiteboard", "canvas"]),

    // 07 - Assistant
    n("ai-assistant", "The AI Assistant", ASSISTANT, ["ai-providers", "knowledge-graph", "wikilinks"]),
    n("ai-providers", "AI Providers & Keys", ASSISTANT, ["ai-assistant"]),

    // 08 - Examples
    n("ex-research", "Example — Research Project", EXAMPLES, ["ex-literature", "tasks", "citations"]),
    n("ex-literature", "Example — Literature Note", EXAMPLES, ["citations", "ex-research"]),
    n("ex-meeting", "Example — Meeting Notes", EXAMPLES, ["tasks", "templates"]),
    n("ex-book", "Example — Book Notes", EXAMPLES, ["ex-flashcards", "wikilinks"]),
    n("ex-recipe", "Example — Recipe Card", EXAMPLES, ["properties"]),
    n("ex-trip", "Example — Trip Plan", EXAMPLES, ["tasks", "table-view"]),
    n("ex-code", "Example — Code Snippets", EXAMPLES, ["code-blocks"]),
    n("ex-diagrams", "Example — Diagram Gallery", EXAMPLES, ["markdown-basics"]),
    n("ex-physics", "Example — Physics Worksheet", EXAMPLES, ["math-engine", "plotting"]),
    n("ex-flashcards", "Example — Flashcard Deck", EXAMPLES, ["flashcards"]),
    n("ex-daily", "Example — A Daily Note", EXAMPLES, ["daily-notes"]),
    n("ex-decision", "Example — Decision Log", EXAMPLES, ["properties"]),
  ],
};
