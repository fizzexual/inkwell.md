import { useMemo, type MouseEvent } from "react";
import { useVault } from "../store/useVault";
import { renderMarkdown } from "../markdown";
import { Graph, Pencil, Doc } from "../icons";
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

  const note = notesById.get(selectedId);
  const md = note?.content ?? "";
  const html = useMemo(() => renderMarkdown(md, resolve), [md, resolve]);

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

      <div className="article-body">
        {editing ? (
          <textarea
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
