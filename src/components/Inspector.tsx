import { useVault } from "../store/useVault";
import { vault } from "../data/vault";
import { backlinksOf, linksOf } from "../data/derive";
import type { Note } from "../data/vault";
import { ArrowRight, OpenExternal } from "../icons";
import "./Inspector.css";

function kindLabel(n: Note) {
  return n.kind === "source" ? "Source" : "Article";
}

function LinkRow({ note }: { note: Note }) {
  const openArticle = useVault((s) => s.openArticle);
  return (
    <button className="link-row" onClick={() => openArticle(note.id)}>
      <span className="link-text">
        <span className="link-title">{note.title}</span>
        <span className="link-kind">{kindLabel(note)}</span>
      </span>
      <ArrowRight size={15} className="link-arrow" />
    </button>
  );
}

export default function Inspector() {
  const selectedId = useVault((s) => s.selectedId);
  const openArticle = useVault((s) => s.openArticle);
  const note = vault.notes.find((n) => n.id === selectedId);

  if (!note) return <aside className="inspector" />;

  const links = linksOf(vault, note);
  const backlinks = backlinksOf(vault, note.id);

  return (
    <aside className="inspector">
      <div className="insp-scroll">
        <div className="insp-eyebrow">{note.kind === "source" ? "SOURCE" : "ARTICLE"}</div>
        <h2 className="insp-title">{note.title}</h2>
        <div className="insp-meta">{note.kind === "source" ? "Source" : "Note"}</div>

        <button className="open-btn" onClick={() => openArticle(note.id)}>
          <OpenExternal size={15} />
          <span>Open {note.kind === "source" ? "Source" : "Article"}</span>
        </button>

        <section className="link-section">
          <div className="section-label">Links To ({links.length})</div>
          <div className="link-list">
            {links.length ? (
              links.map((n) => <LinkRow key={n.id} note={n} />)
            ) : (
              <div className="empty">No outgoing links.</div>
            )}
          </div>
        </section>

        <section className="link-section">
          <div className="section-label">Backlinks ({backlinks.length})</div>
          <div className="link-list">
            {backlinks.length ? (
              backlinks.map((n) => <LinkRow key={n.id} note={n} />)
            ) : (
              <div className="empty">No backlinks.</div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
