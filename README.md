# Inkwell

A local-first research workspace for Windows. Read papers, manage sources, take
markdown notes, cite evidence, and turn literature into structured writing —
instead of juggling Zotero, Obsidian, a PDF reader and a writing app.

Built with **Tauri 2 + React + TypeScript**, light & dark themes.

## Features

- **Three-pane workspace** — file tree · center (graph / article) · inspector,
  with draggable, persisted pane widths.
- **Knowledge graph** — a d3-force map of the whole vault. Drag, zoom, pan,
  hover to spotlight a node's connections, click to select, double-click to
  open. Layout is settled synchronously so it renders instantly.
- **Markdown notes** — every note is an editable markdown document. Read mode
  renders GFM (tables, code, quotes); edit mode has a formatting toolbar.
- **Live `[[wikilinks]]`** — links are parsed from note content, so editing a
  note updates the graph, backlinks and inspector in real time. Rename a note by
  editing its first heading.
- **Command palette** — `Ctrl/Cmd+P` fuzzy quick-switcher to any note.
- **Full-text search** — search titles and bodies with highlighted snippets.
- **Overview dashboard** — note / link / source / tag counts, most-linked notes,
  per-folder breakdown and orphans.
- **Tags** — `#tags` parsed from content, shown as pills, click to filter.
- **Outline** — "on this page" heading list with click-to-scroll.
- **Create notes** from the sidebar or `Ctrl/Cmd+N`.
- **Light / dark theme** toggle, and everything (edits, new notes, layout,
  theme, selection) persists to `localStorage`.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+P` / `+K` | Command palette |
| `Ctrl/Cmd+N` | New note |
| `Ctrl/Cmd+E` | Toggle edit / read |
| `Ctrl/Cmd+G` | Go to the knowledge map |
| `Esc` | Leave edit mode, then return to the map |

## Stack

- **[Tauri 2](https://tauri.app)** — frameless native Windows shell.
- **React 18 + TypeScript + Vite** — the UI.
- **[d3-force](https://github.com/d3/d3-force)** — the knowledge graph.
- **[Zustand](https://github.com/pmndrs/zustand)** — single source of truth; the
  tree, graph, links and backlinks are all derived from one note list.
- **[marked](https://marked.js.org)** — markdown rendering.
- **[@fontsource/inter](https://fontsource.org/fonts/inter)** — self-hosted, no CDN.

## Project structure

```
src/
  components/   TitleBar · Sidebar · KnowledgeMap · KnowledgeGraph · ArticleView
                Inspector · CommandPalette · SearchPanel · StatsPanel · Resizer
  data/         vault.ts (seed) · content.ts (seed bodies) · derive.ts
  store/        useVault.ts (Zustand single source of truth + persistence)
  markdown.ts   wikilinks · tags · headings · rendering
  fuzzy.ts      subsequence matcher
src-tauri/      Rust shell, window config, capabilities, icons
```

## Develop

```bash
npm install
npm run tauri dev      # native window (requires Rust + WebView2)
npm run dev            # just the web UI in a browser
npm run build          # type-check + production bundle
npm run tauri build    # package the Windows installer
```

## Roadmap

- [ ] Open a real folder as a vault (read/write markdown on disk via Rust)
- [ ] Embedded PDF reader with highlight-to-note
- [ ] Citations & source metadata (BibTeX / CSL import)
- [ ] Local-graph mode (neighbourhood of the selected note)
- [ ] Folder management (create / rename / move)

## License

MIT
