<div align="center">

# Inkwell

**A local-first research workspace for Windows.**

Read papers, manage sources, write linked markdown notes, and see your
literature as a living knowledge graph — without stitching together Zotero,
Obsidian, a PDF reader and a writing app.

`Tauri 2` · `React` · `TypeScript` · `d3-force` · light + dark

</div>

---

## Why

Research tools force a trade: a reference manager that can't write, a note app
that can't read PDFs, a graph view bolted onto a folder of files. Inkwell treats
the **note** as the atom and derives everything else from it — the file tree,
the link graph, backlinks, tags and search are all projections of one source of
truth. Edit a note and the graph moves with it.

It is **local-first**: your vault is plain markdown, nothing leaves the machine,
and the app ships as a single native Windows binary.

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
| `Esc` | Leave edit, then return to the map |

## Develop

```bash
npm install
npm run tauri dev      # native window (needs Rust + WebView2)
npm run dev            # web UI only, in a browser
npm run build          # type-check + production bundle
npm run tauri build    # package the Windows installer
```

## Roadmap

- [ ] Open a real folder as a vault (read/write markdown on disk via Rust)
- [ ] Embedded PDF reader with highlight-to-note
- [ ] Citations & source metadata (BibTeX / CSL import)
- [ ] Local-graph mode — the neighbourhood of the selected note
- [ ] Folder management (create / rename / move)

## License

[MIT](LICENSE)
