// What a note needs to render (links, embeds, citations, math, queries, bibliography, diagrams) —
// shared by the reading view and the live editor so both show the same thing.
import type { RenderCtx, Resolver } from "./markdown";
import type { Note } from "./data/vault";
import type { Citation } from "./data/derive";
import type { MathResult } from "./math/engine";
import { buildMathCtx } from "./math/render";
import { runQuery } from "./dataview";
import { buildBibliography } from "./data/derive";

export interface NoteRenderInput {
  /** the whole note's markdown (the bibliography lists what the whole note cites) */
  md: string;
  noteId: string;
  notes: Note[];
  notesById: Map<string, Note>;
  resolve: Resolver;
  citeMap: Map<string, Citation>;
  mathResult: MathResult;
}

export function noteRenderCtx(i: NoteRenderInput): RenderCtx {
  return {
    resolve: i.resolve,
    getNote: (id) => {
      const n = i.notesById.get(id);
      return n ? { title: n.title, content: n.content ?? "" } : undefined;
    },
    cite: (key) => {
      const c = i.citeMap.get(key);
      return c ? { id: c.id, label: c.label } : undefined;
    },
    math: buildMathCtx(i.mathResult),
    query: (src) => runQuery(src, i.notes, i.noteId),
    bibliography: () => buildBibliography(i.md, i.citeMap),
  };
}

// unique mermaid render ids across calls and panes (time-based ids could collide)
let mermaidSeq = 0;

/**
 * Draw every not-yet-drawn ```mermaid block under `root` (mermaid is lazy-loaded). Safe to call
 * on every render: blocks already drawn or in progress are skipped, and a block that left the
 * page before its diagram was ready is left alone.
 */
export function renderMermaid(root: ParentNode, theme: string): void {
  const blocks = [...root.querySelectorAll<HTMLElement>(".mermaid-src:not(.mermaid-done):not(.mermaid-busy)")];
  if (!blocks.length) return;
  blocks.forEach((el) => el.classList.add("mermaid-busy"));
  const finish = (el: HTMLElement, html: string) => {
    if (!el.isConnected) return;
    el.innerHTML = html;
    el.classList.remove("mermaid-busy");
    el.classList.add("mermaid-done");
  };
  import("mermaid")
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === "dark" ? "dark" : "neutral",
        // strict: labels are HTML-escaped and click/callback directives are disabled — diagrams
        // come from note text, which may be untrusted (clips, imports, shared vaults)
        securityLevel: "strict",
        fontFamily: "Inter, sans-serif",
      });
      for (const el of blocks) {
        if (!el.isConnected) continue;
        const src = (el.textContent || "").trim();
        mermaid
          .render(`mmd-${++mermaidSeq}`, src)
          .then(({ svg }) => finish(el, svg))
          .catch(() => finish(el, `<div class="mermaid-error">Diagram syntax error</div>`));
      }
    })
    .catch(() => blocks.forEach((el) => el.classList.remove("mermaid-busy")));
}
