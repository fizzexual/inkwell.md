import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { useVault } from "../store/useVault";
import { useMath } from "../math/useMath";
import { buildMathCtx } from "../math/render";
import { renderMarkdown, parseFrontmatter } from "../markdown";
import MarkdownEditor from "./MarkdownEditor";
import PropertiesPanel from "./PropertiesPanel";
import { Graph, Pencil, Doc } from "../icons";
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
  const updateContent = useVault((s) => s.updateContent);
  const scrollTarget = useVault((s) => s.scrollTarget);
  const clearScrollTarget = useVault((s) => s.clearScrollTarget);
  const mathResult = useMath((s) => s.result);

  const showEditor = isActive && editing;
  const bodyRef = useRef<HTMLDivElement>(null);

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

  if (!note) return <main className="article" />;

  const crumbs = note.folder ? note.folder.split("/") : [];

  const onPreviewClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("a.wikilink, a.embed-head, a.cite") as HTMLElement | null;
    if (target?.dataset.note) {
      e.preventDefault();
      openArticle(target.dataset.note);
    }
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
          <button className="seg-btn" onClick={() => setCenterView("graph")}>
            <Graph size={14} />
            <span>Map</span>
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
              dangerouslySetInnerHTML={{ __html: html }}
            />
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
