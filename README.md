<div align="center">

# Inkwell 🌱

**A local-first research workspace for Windows.**

Read papers, manage sources, write linked markdown notes, and see your
literature as a living knowledge graph — without stitching together Zotero,
Obsidian, a PDF reader and a writing app.

`Tauri 2` · `React` · `TypeScript` · `d3-force` · light + dark

</div>

---

## About

Inkwell is a desktop app for researchers and students who read papers and write notes about them. Notes are plain markdown linked with `[[wikilinks]]`, and the app turns them into a knowledge graph, backlinks, tags and search. It is in active development as a Windows Tauri app: you can open a real folder of markdown files as your vault, read PDFs and save highlights into notes, and import sources from BibTeX, DOI or arXiv to cite with `[@key]`.

## Why

Research tools force a trade: a reference manager that can't write, a note app
that can't read PDFs, a graph view bolted onto a folder of files. Inkwell treats
the **note** as the atom and derives everything else from it — the file tree,
the link graph, backlinks, tags and search are all projections of one source of
truth. Edit a note and the graph moves with it.

It is **local-first**: your vault is plain markdown on your disk, your notes are
never uploaded anywhere, and the app ships as a single native Windows binary.

### What goes online

Some features do use the network. Plainly:

- **On-device AI models** (semantic search, audio transcription) are downloaded
  once from Hugging Face, and the ONNX runtime that runs them comes from
  jsDelivr. After that they run on your machine; the note text you search or
  the audio you transcribe is not sent anywhere.
- **Web clipping** sends the page URL to `r.jina.ai`, which returns it as markdown.
- **DOI / arXiv lookups** query Crossref and arXiv with the id you typed.
- **Update checks** (installed app only): about 10 seconds after launch, and when
  you pick *Check for updates*, Inkwell fetches `latest.json` from this repo's
  GitHub releases. Nothing is downloaded or installed until you click
  *Install & restart*.
- **The AI assistant** talks to a cloud provider (Groq, OpenAI, Anthropic, …)
  only if you add an API key for it — and then the notes you ask about are sent
  to that provider. With Ollama it stays on your machine.

## Highlights

| | |
|---|---|
| **Knowledge graph** | A d3-force map of the whole vault — drag, zoom, hover to spotlight a node's neighbourhood, double-click to open. |
| **Linked markdown** | Every note is editable markdown with a formatting toolbar; `[[wikilinks]]` are parsed from content, so editing rewires the graph live. |
| **Command palette** | `Ctrl/Cmd+P` fuzzy switcher to any note. |
| **Search & overview** | Full-text search with snippets, plus a vault dashboard (counts, most-linked, orphans, folders). |
| **Tags & outline** | `#tags` as filters; an "on this page" outline with click-to-scroll. |
| **Persistent & themeable** | Edits, new notes, layout and theme survive reloads; first-class light **and** dark. |

## Architecture

A few decisions worth calling out, because they shape the whole codebase:

- **One source of truth.** [`useVault`](src/store/useVault.ts) holds the note
  list. The tree, graph, link map and backlinks are *derived* on every mutation
  ([`derive.ts`](src/data/derive.ts)) — there is no second copy of the truth to
  keep in sync.
- **Links live in the prose.** A note's outgoing links are parsed from its
  `[[wikilinks]]`, not stored separately. Editing content is the only way the
  graph changes, which keeps the model honest.
- **The force layout is settled synchronously.** The simulation is `tick()`-ed
  to rest in a tight loop rather than over `requestAnimationFrame`, so the graph
  renders correctly and instantly even in a backgrounded window — no first-paint
  pile-up at the origin. See [`KnowledgeGraph.tsx`](src/components/KnowledgeGraph.tsx).
- **Theming is tokens, not branches.** Colour lives in CSS custom properties; a
  single `[data-theme="dark"]` block overrides them. Components never hardcode a
  hex value.

```
src/
  components/   TitleBar · Sidebar · KnowledgeMap · KnowledgeGraph · ArticleView
                Inspector · CommandPalette · SearchPanel · StatsPanel · Resizer
  data/         vault.ts (seed) · content.ts (seed bodies) · derive.ts
  store/        useVault.ts        ← single source of truth + persistence
  markdown.ts   wikilinks · tags · headings · rendering
  fuzzy.ts      subsequence matcher
src-tauri/      Rust shell · window config · capabilities · icons
```

## Keyboard

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd+P` · `+K` | Command palette |
| `Ctrl/Cmd+N` | New note |
| `Ctrl/Cmd+E` | Toggle edit / read |
| `Ctrl/Cmd+G` | Knowledge map |
| `Ctrl/Cmd+F` | Find & replace (while editing) |
| `Ctrl/Cmd+Shift+F` | Semantic search — find notes by meaning |
| `Ctrl/Cmd+Shift+K` | Quick capture → Inbox |
| `Ctrl/Cmd+Shift+Space` | Quick capture from anywhere (global, desktop app) |
| `Ctrl/Cmd+J` | Toggle the AI assistant |
| `Ctrl/Cmd+.` | Focus / zen mode |
| `Ctrl/Cmd+\` | Toggle sidebar |
| `Ctrl/Cmd+Shift+\` | Toggle inspector |
| `Ctrl/Cmd+Z` · `Ctrl/Cmd+Y` | Undo · redo |
| `Alt+←` · `Alt+→` | Back · forward |
| `?` | All shortcuts |
| `Esc` | Close a dialog; else leave edit, then return to the map |

## Develop

```bash
npm install
npm run tauri dev      # native window (needs Rust + WebView2)
npm run dev            # web UI only, in a browser
npm test               # unit tests (vitest)
npm run build          # type-check + production bundle
npm run tauri build    # package the Windows installer
```

## Install / Updates / Releasing

**Install.** Download `Inkwell_<version>_x64-setup.exe` from
[Releases](https://github.com/fizzexual/inkwell.md/releases) and run it. It
installs for your user only (no admin prompt) and adds a Start-menu shortcut.

**Updates.** The installed app checks for a newer release about 10 seconds after
launch (silently — you only hear about it if there is one) and whenever you pick
**Appearance → Check for updates**. When one exists, a banner offers
**Install & restart**: one click saves your notes, downloads the update with
progress, installs it and reopens Inkwell. Updates are signed; the app refuses an
installer whose signature does not match the public key in `tauri.conf.json`.

**Releasing** (maintainer):

1. Bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
   `package.json` (the script refuses if they disagree). Commit.
2. `npm run release` builds a signed installer into `release/` with its `.sig`,
   `latest.json` and `notes.md`, and prints the `gh release create` command.
   Add `-- --notes "What changed"` for release notes.
3. `npm run release -- --publish` does the same and publishes `v<version>` with
   `gh`. Installed apps pick it up from `releases/latest/download/latest.json`.

The signing key lives outside the repo in `%USERPROFILE%\.tauri\`
(`inkwell-updater.key` + `.password`). Back it up: without it no update can ever
be shipped to existing installs.

## Roadmap

- [x] Open a real folder as a vault (read/write markdown on disk via Rust)
- [x] Citations & source metadata — BibTeX import, DOI / arXiv lookup, `[@key]` citations, `bibliography` blocks (CSL styles not yet)
- [x] Local-graph mode — the neighbourhood of the selected note
- [ ] Embedded PDF reader with highlight-to-note — **partial**: the reader saves selected text (with its page) into a highlights note; highlights are not yet drawn on the PDF itself
- [ ] Folder management — notes can be moved between folders; creating and renaming folders is not done yet

## License

[MIT](LICENSE)
