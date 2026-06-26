# Inkwell

A local-first research workspace for Windows. Read papers, manage sources, take
markdown notes, cite evidence, and turn literature into structured writing —
instead of juggling Zotero, Obsidian, a PDF reader and a writing app.

> **Status — UI shell.** This build is the pixel-perfect three-pane *Knowledge
> Map* workspace driven by a realistic in-memory vault. Real on-disk vaults, the
> PDF reader, the markdown editor, citations and persistence are the next pass
> (see [Roadmap](#roadmap)).

## Stack

- **[Tauri 2](https://tauri.app)** — frameless native Windows shell, ships as a
  small `.exe`. Rust backend stays minimal for now.
- **React 18 + TypeScript + Vite** — the UI.
- **[d3-force](https://github.com/d3/d3-force)** — the knowledge graph, settled
  *synchronously* (no `requestAnimationFrame` dependency) so it lays out
  instantly and renders correctly even in a background window.
- **[Zustand](https://github.com/pmndrs/zustand)** — one in-memory vault feeds
  the file tree, the graph and the inspector; selecting a node anywhere updates
  all three.
- **[@fontsource/inter](https://fontsource.org/fonts/inter)** — self-hosted, no
  CDN (a local-first app shouldn't phone home for fonts).

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ●●●  titlebar (frameless, custom window controls)            │
├──────────────┬────────────────────────────┬─────────────────┤
│ SIDEBAR      │  KNOWLEDGE MAP             │ INSPECTOR        │
│ vault header │  Links / Sources / Fit     │ ARTICLE          │
│ view tabs    │                            │ title · Note     │
│ tree toolbar │  d3-force graph            │ Open Article     │
│ file tree    │  (drag · zoom · pan ·      │ Links To (n)     │
│ (collapsible)│   select → inspector)      │ Backlinks (n)    │
└──────────────┴────────────────────────────┴─────────────────┘
```

## Project structure

```
src/
  components/      TitleBar, Sidebar, KnowledgeMap, KnowledgeGraph, Inspector
  data/            vault.ts (sample vault) · derive.ts (tree / graph / backlinks)
  store/           useVault.ts (Zustand)
  styles/          tokens.css (design tokens) · global.css
  icons.tsx        inline SVG icon set
src-tauri/         Rust shell, window config, capabilities, icons
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
- [ ] Markdown editor with `[[wikilink]]` autocomplete
- [ ] Citations & source metadata (BibTeX / CSL import)
- [ ] Full-text search across the vault
- [ ] Dark theme

## License

MIT
