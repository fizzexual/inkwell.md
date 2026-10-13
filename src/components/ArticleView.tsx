import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useVault } from "../store/useVault";
import { useSmoothScroll } from "../useSmoothScroll";
import { parseFrontmatter } from "../markdown";
import { renderMermaid } from "../renderCtx";
import { useNoteHtml } from "../useNoteHtml";
import MarkdownEditor from "./MarkdownEditor";
import LiveEditor from "./LiveEditor";
import PropertiesPanel from "./PropertiesPanel";
import { onPdfLinkClick } from "../pdfLinks";
import { useChat } from "../ai/useChat";
import { History } from "lucide-react";
import { Graph, Pencil, Doc, Sparkles } from "../icons";
import "./ArticleView.css";

function wordCount(md: string): number {
  const text = md.replace(/[#>*`_\-[\]|]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

export default function ArticleView({ noteId, isActive }: { noteId: string; isActive: boolean }) {
  // only this note (and, via useNoteHtml, what it embeds / queries): typing in another note
  // never re-renders this pane
  const note = useVault((s) => s.notesById.get(noteId));
  const editing = useVault((s) => s.editing);
  const setEditing = useVault((s) => s.setEditing);
  const editorMode = useVault((s) => s.editorMode);
  const setEditorMode = useVault((s) => s.setEditorMode);
  const setCenterView = useVault((s) => s.setCenterView);
  const openArticle = useVault((s) => s.openArticle);
  const openTag = useVault((s) => s.openTag);
  const openPdfLink = useVault((s) => s.openPdfLink);
  const updateContent = useVault((s) => s.updateContent);
  const scrollTarget = useVault((s) => s.scrollTarget);
  const clearScrollTarget = useVault((s) => s.clearScrollTarget);
  const theme = useVault((s) => s.theme);

  const showEditor = isActive && editing;
  const [hover, setHover] = useState<{ x: number; y: number; id: string } | null>(null);
  const hoverNote = useVault((s) => (hover ? s.notesById.get(hover.id) : undefined));
  const bodyRef = useRef<HTMLDivElement>(null);
  useSmoothScroll(bodyRef);

  const md = note?.content ?? "";
  const { data: frontmatter, body } = useMemo(() => parseFrontmatter(md), [md]);
  const words = useMemo(() => wordCount(body), [body]);
  // the preview isn't on screen while editing: don't render it on every keystroke
  const htmlOf = useNoteHtml(noteId, md);
  const html = showEditor ? "" : htmlOf(md);
  // React 19 diffs dangerouslySetInnerHTML by object identity, so a fresh {__html} on every
  // render rewrites innerHTML on ANY re-render (re-opening this note, hovering a link…) and
  // wipes the diagrams / highlighting / copy buttons the effects below added. Keep one object
  // per real content change; the effects key on it so they re-run whenever the DOM is reset.
  // theme is included so diagrams re-render in the new theme from their source.
  const preview = useMemo(() => ({ __html: html }), [html, theme, noteId]);

  useEffect(() => {
    if (!scrollTarget || showEditor || !isActive) return;
    const el = bodyRef.current?.querySelector(`[data-heading="${CSS.escape(scrollTarget)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    clearScrollTarget();
  }, [scrollTarget, showEditor, isActive, html, clearScrollTarget]);

  // render ```mermaid diagrams (lazy-loaded)
  useEffect(() => {
    const root = bodyRef.current;
    if (showEditor || !root) return;
    renderMermaid(root, theme);
  }, [preview, showEditor, theme]);

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
  }, [preview, showEditor]);

  // add a "Copy" button to each rendered code block
  useEffect(() => {
    const root = bodyRef.current;
    if (showEditor || !root) return;
    root.querySelectorAll<HTMLElement>("pre:not([data-copy])").forEach((pre) => {
      if (pre.querySelector(".mermaid-src")) return;
      pre.setAttribute("data-copy", "");
      pre.style.position = "relative";
      const btn = document.createElement("button");
      btn.className = "code-copy";
      btn.type = "button";
      btn.textContent = "Copy";
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        navigator.clipboard?.writeText(code);
        btn.textContent = "Copied";
        window.setTimeout(() => (btn.textContent = "Copy"), 1200);
      });
      pre.appendChild(btn);
    });
  }, [preview, showEditor]);

  if (!note) return <main className="article" />;

  const crumbs = note.folder ? note.folder.split("/") : [];

  const onPreviewClick = (e: MouseEvent<HTMLDivElement>) => {
    // `[p. 12](#/pdf/Attachments/paper.pdf?page=12)` → that PDF at that page
    if (onPdfLinkClick(e, (rel, page) => void openPdfLink(rel, page))) return;
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
          {showEditor && (
            <div className="mode-toggle" role="group" aria-label="Editor mode">
              <button
                className={"mode-btn" + (editorMode === "source" ? " on" : "")}
                onClick={() => setEditorMode("source")}
                title="Edit raw markdown"
              >
                Source
              </button>
              <button
                className={"mode-btn" + (editorMode === "live" ? " on" : "")}
                onClick={() => setEditorMode("live")}
                title="Live preview — formatted as you go, edit any block inline"
              >
                Live
              </button>
            </div>
          )}
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
          <button
            className="seg-btn"
            title="Version history"
            onClick={() => useVault.setState({ historyOpen: true })}
          >
            <History size={14} />
          </button>
        </div>
      </header>

      {showEditor ? (
        editorMode === "live" ? (
          <LiveEditor value={md} onChange={(v) => updateContent(noteId, v)} noteId={noteId} />
        ) : (
          <MarkdownEditor
            value={md}
            onChange={(v) => updateContent(noteId, v)}
            selfId={noteId}
          />
        )
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
              dangerouslySetInnerHTML={preview}
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
