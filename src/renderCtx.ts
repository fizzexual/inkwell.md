// What a note needs to render (links, embeds, citations, math, queries, bibliography, diagrams) —
// shared by the reading view and the live editor so both show the same thing.
import { renderMarkdown, type RenderCtx, type Resolver } from "./markdown";
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

/** Everything a piece of a note's markdown can read while rendering, plus the vault's metaRev. */
export interface RenderEnv extends NoteRenderInput {
  metaRev: number;
}

/** Rendered HTML plus what it read, so it is only redone when one of those changed. */
export interface Rendered {
  html: string;
  noteId: string;
  resolve: Resolver;
  citeMap: Map<string, Citation>;
  mathResult: MathResult;
  /** the notes it embedded (![[…]]), as they were */
  embeds: Map<string, Note | undefined>;
  /** metaRev when it ran a ```query (null: it ran none) */
  metaRev: number | null;
  /** the whole note's text when it drew a ```bibliography (null: it drew none) */
  md: string | null;
}

/** renderMarkdown(text), recording what the render read from outside `text`. */
export function renderTracked(text: string, env: RenderEnv): Rendered {
  const base = noteRenderCtx(env);
  const r: Rendered = {
    html: "",
    noteId: env.noteId,
    resolve: env.resolve,
    citeMap: env.citeMap,
    mathResult: env.mathResult,
    embeds: new Map(),
    metaRev: null,
    md: null,
  };
  r.html = renderMarkdown(text, {
    ...base,
    getNote: (id) => {
      r.embeds.set(id, env.notesById.get(id));
      return base.getNote!(id);
    },
    query: (src) => {
      r.metaRev = env.metaRev;
      return base.query!(src);
    },
    bibliography: () => {
      r.md = env.md;
      return base.bibliography!();
    },
  });
  return r;
}

/** True when rendering the same text again in `env` would give the same HTML. */
export function isFresh(r: Rendered, env: RenderEnv): boolean {
  if (r.noteId !== env.noteId || r.resolve !== env.resolve || r.citeMap !== env.citeMap) return false;
  if (r.mathResult !== env.mathResult) return false;
  if (r.metaRev !== null && r.metaRev !== env.metaRev) return false;
  if (r.md !== null && r.md !== env.md) return false;
  for (const [id, n] of r.embeds) if (env.notesById.get(id) !== n) return false;
  return true;
}

/**
 * The store values these renders depend on beyond their own text (embedded notes, metaRev for
 * queries) — for a shallow-compared selector, so a pane re-renders only when one of them changes.
 */
export function watchedBy(
  rendered: Iterable<Rendered>,
  s: { notesById: Map<string, Note>; metaRev: number },
): unknown[] {
  const out: unknown[] = [];
  for (const r of rendered) {
    if (r.metaRev !== null) out.push(s.metaRev);
    for (const id of r.embeds.keys()) out.push(s.notesById.get(id));
  }
  return out;
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
