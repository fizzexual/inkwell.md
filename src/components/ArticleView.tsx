import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useVault } from "../store/useVault";
import { useMath } from "../math/useMath";
import { buildMathCtx } from "../math/render";
import { useSmoothScroll } from "../useSmoothScroll";
import { renderMarkdown, parseFrontmatter } from "../markdown";
import MarkdownEditor from "./MarkdownEditor";
import PropertiesPanel from "./PropertiesPanel";
import { useChat } from "../ai/useChat";
import { Graph, Pencil, Doc, Sparkles } from "../icons";
import "./ArticleView.css";

function wordCount(md: string): number {
  const text = md.replace(/[#>*`_\-[\]|]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

export default function ArticleView({ noteId, isActive }: { noteId: string; isActive: boolean }) {
  const notes = useVault((s) => s.notes);
  const notesById = useVault((s) => s.notesById);
  const resolve = useVault((s) => s.resolve);
  const citeMap = useVault((s) => s.citeMap);
  const editing = useVault((s) => s.editing);
  const setEditing = useVault((s) => s.setEditing);
  const setCenterView = useVault((s) => s.setCenterView);
  const openArticle = useVault((s) => s.openArticle);
  const openTag = useVault((s) => s.openTag);
  const updateContent = useVault((s) => s.updateContent);
  const scrollTarget = useVault((s) => s.scrollTarget);
  const clearScrollTarget = useVault((s) => s.clearScrollTarget);
  const theme = useVault((s) => s.theme);
  const mathResult = useMath((s) => s.result);

  const showEditor = isActive && editing;
  const [hover, setHover] = useState<{ x: number; y: number; id: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useSmoothScroll(bodyRef);

  const note = notesById.get(noteId);
  const md = note?.content ?? "";
  const { data: frontmatter, body } = useMemo(() => parseFrontmatter(md), [md]);
  const words = wordCount(body);
  const html = useMemo(
    () =>
      renderMarkdown(md, {
        resolve,
        getNote: (id) => {
          const n = notesById.get(id);
          return n ? { title: n.title, content: n.content ?? "" } : undefined;
        },
        cite: (key) => {
          const c = citeMap.get(key);
          return c ? { id: c.id, label: c.label } : undefined;
        },
        math: buildMathCtx(mathResult),
      }),
    [md, resolve, notesById, citeMap, mathResult],
  );

  useEffect(() => {
    if (!scrollTarget || showEditor || !isActive) return;
    const el = bodyRef.current?.querySelector(`#${CSS.escape(scrollTarget)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    clearScrollTarget();
  }, [scrollTarget, showEditor, isActive, html, clearScrollTarget]);

  // render ```mermaid diagrams (lazy-loaded)
  useEffect(() => {
    const root = bodyRef.current;
    if (showEditor || !root) return;
    const blocks = root.querySelectorAll<HTMLElement>(".mermaid-src:not(.mermaid-done)");
    if (!blocks.length) return;
    let cancelled = false;
    import("mermaid").then(({ default: mermaid }) => {
      if (cancelled) return;
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === "dark" ? "dark" : "neutral",
        securityLevel: "loose",
        fontFamily: "Inter, sans-serif",
      });
      blocks.forEach((el, i) => {
        const src = (el.textContent || "").trim();
        mermaid
          .render(`mmd-${i}-${src.length}-${Math.floor(performance.now())}`, src)
          .then(({ svg }) => {
            if (cancelled) return;
            el.innerHTML = svg;
            el.classList.add("mermaid-done");
          })
          .catch(() => {
            el.innerHTML = `<div class="mermaid-error">Diagram syntax error</div>`;
            el.classList.add("mermaid-done");
          });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [html, showEditor, theme]);

  // syntax-highlight ```code blocks (highlight.js lazy-loaded, only when a block exists)
  useEffect(() => {
    const root = bodyRef.current;
    if (showEditor || !root) return;
    const blocks = root.querySelectorAll<HTMLElement>("pre code:not(.hljs)");
    if (!blocks.length) return;
    let cancelled = false;
    import("highlight.js").then(({ default: hljs }) => {
      if (cancelled) return;
      blocks.forEach((el) => hljs.highlightElement(el));
    });
    return () => {
      cancelled = true;
    };
  }, [html, showEditor]);

  if (!note) return <main className="article" />;

  const crumbs = note.folder ? note.folder.split("/") : [];

  const onPreviewClick = (e: MouseEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).closest("a.tag") as HTMLElement | null;
    if (tag?.dataset.tag) {
      e.preventDefault();
      openTag(tag.dataset.tag);
      return;
    }
    const target = (e.target as HTMLElement).closest("a.wikilink, a.embed-head, a.cite") as HTMLElement | null;
    if (target?.dataset.note) {
      e.preventDefault();
      openArticle(target.dataset.note);
    }
  };

  const onPreviewOver = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a.wikilink[data-note]") as HTMLElement | null;
    if (!a?.dataset.note) return;
    const r = a.getBoundingClientRect();
    setHover({ x: Math.min(r.left, window.innerWidth - 320), y: r.bottom + 6, id: a.dataset.note });
  };
  const onPreviewOut = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a.wikilink")) setHover(null);
  };
  const hoverNote = hover ? notesById.get(hover.id) : null;

  return (
    <main className="article">
      <header className="article-header">
        <div className="crumbs">
          {crumbs.map((c) => (
            <span key={c} className="crumb">
              {c.replace(/^\d+\s*-\s*/, "")}
              <span className="crumb-sep">/</span>
            </span>
          ))}
          <span className="crumb current">{note.title}</span>
        </div>
        <div className="article-actions">
          <button
            className={"seg-btn" + (showEditor ? " active" : "")}
            onClick={() => setEditing(!showEditor)}
          >
            {showEditor ? <Doc size={14} /> : <Pencil size={14} />}
            <span>{showEditor ? "Read" : "Edit"}</span>
          </button>
          <button className="seg-btn" onClick={() => setCenterView("graph")}>
            <Graph size={14} />
            <span>Map</span>
          </button>
          <button
            className="seg-btn"
            title="Ask the assistant about this note"
            onClick={() => {
              useVault.setState({ aiOpen: true });
              useChat
                .getState()
                .send(`Summarise the note "${note.title}" in a few concise bullet points, citing it.`);
            }}
          >
            <Sparkles size={14} />
            <span>Ask AI</span>
          </button>
        </div>
      </header>

      {showEditor ? (
        <MarkdownEditor
          value={md}
          onChange={(v) => updateContent(noteId, v)}
          notes={notes}
          selfId={noteId}
        />
      ) : (
        <div className="article-body" ref={bodyRef}>
          <div key={noteId} className="article-doc">
            <PropertiesPanel data={frontmatter} noteId={noteId} />
            <div
              className="md-preview"
              onClick={onPreviewClick}
              onMouseOver={onPreviewOver}
              onMouseOut={onPreviewOut}
              onMouseLeave={() => setHover(null)}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      )}

      {hoverNote && (
        <div className="link-preview" style={{ left: hover!.x, top: hover!.y }}>
          <div className="lp-title">{hoverNote.title}</div>
          <div className="lp-body">
            {(hoverNote.content ?? "")
              .replace(/^---\n[\s\S]*?\n---\n/, "")
              .replace(/^#\s+.*$/m, "")
              .replace(/[#>*`_[\]]/g, "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 220) || "Empty note"}
          </div>
        </div>
      )}

      <footer className="article-footer">
        <span>{note.kind === "source" ? "Source" : "Note"}</span>
        <span className="dot-sep">·</span>
        <span>{words} words</span>
        <span className="dot-sep">·</span>
        <span>{Math.max(1, Math.round(words / 200))} min read</span>
        <span className="dot-sep">·</span>
        <span>{showEditor ? "Editing" : "Reading"}</span>
      </footer>
    </main>
  );
}
