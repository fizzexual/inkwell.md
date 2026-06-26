import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { useVault } from "../store/useVault";
import { renderMarkdown } from "../markdown";
import { Graph, Pencil, Doc, Bold, Italic, Heading, ListIcon, Quote, Code, Link } from "../icons";
import "./ArticleView.css";

function wordCount(md: string): number {
  const text = md.replace(/[#>*`_\-[\]|]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

export default function ArticleView() {
  const selectedId = useVault((s) => s.selectedId);
  const notesById = useVault((s) => s.notesById);
  const resolve = useVault((s) => s.resolve);
  const editing = useVault((s) => s.editing);
  const setEditing = useVault((s) => s.setEditing);
  const setCenterView = useVault((s) => s.setCenterView);
  const openArticle = useVault((s) => s.openArticle);
  const updateContent = useVault((s) => s.updateContent);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTarget = useVault((s) => s.scrollTarget);
  const clearScrollTarget = useVault((s) => s.clearScrollTarget);

  const note = notesById.get(selectedId);
  const md = note?.content ?? "";
  const html = useMemo(() => renderMarkdown(md, resolve), [md, resolve]);

  useEffect(() => {
    if (!scrollTarget || editing) return;
    const el = bodyRef.current?.querySelector(`#${CSS.escape(scrollTarget)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    clearScrollTarget();
  }, [scrollTarget, editing, html, clearScrollTarget]);

  const surround = (left: string, right = left, placeholder = "text") => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const sel = value.slice(a, b) || placeholder;
    const next = value.slice(0, a) + left + sel + right + value.slice(b);
    updateContent(selectedId, next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(a + left.length, a + left.length + sel.length);
    });
  };

  const prefixLine = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: a, value } = ta;
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    updateContent(selectedId, next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(a + prefix.length, a + prefix.length);
    });
  };

  if (!note) return <main className="article" />;

  const crumbs = note.folder ? note.folder.split("/") : [];

  const onPreviewClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("a.wikilink") as HTMLElement | null;
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
            className={"seg-btn" + (editing ? " active" : "")}
            onClick={() => setEditing(!editing)}
          >
            {editing ? <Doc size={14} /> : <Pencil size={14} />}
            <span>{editing ? "Read" : "Edit"}</span>
          </button>
          <button className="seg-btn" onClick={() => setCenterView("graph")}>
            <Graph size={14} />
            <span>Map</span>
          </button>
        </div>
      </header>

      {editing && (
        <div className="md-toolbar">
          <button title="Heading" onClick={() => prefixLine("## ")}>
            <Heading size={15} />
          </button>
          <button title="Bold" onClick={() => surround("**")}>
            <Bold size={15} />
          </button>
          <button title="Italic" onClick={() => surround("_")}>
            <Italic size={15} />
          </button>
          <button title="Inline code" onClick={() => surround("`")}>
            <Code size={15} />
          </button>
          <span className="tb-sep" />
          <button title="List item" onClick={() => prefixLine("- ")}>
            <ListIcon size={15} />
          </button>
          <button title="Quote" onClick={() => prefixLine("> ")}>
            <Quote size={15} />
          </button>
          <button title="Wiki link" onClick={() => surround("[[", "]]", "Note Title")}>
            <Link size={15} />
          </button>
        </div>
      )}
      <div className="article-body" ref={bodyRef}>
        {editing ? (
          <textarea
            ref={taRef}
            className="md-editor"
            value={md}
            spellCheck={false}
            onChange={(e) => updateContent(selectedId, e.target.value)}
            placeholder="Write in markdown… use [[Note Title]] to link."
          />
        ) : (
          <div
            className="md-preview"
            onClick={onPreviewClick}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      <footer className="article-footer">
        <span>{note.kind === "source" ? "Source" : "Note"}</span>
        <span className="dot-sep">·</span>
        <span>{wordCount(md)} words</span>
        <span className="dot-sep">·</span>
        <span>{editing ? "Editing" : "Reading"}</span>
      </footer>
    </main>
  );
}
