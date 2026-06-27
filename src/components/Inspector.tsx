import { useVault } from "../store/useVault";
import type { Note } from "../data/vault";
import { parseTags, parseHeadings, parseCitations } from "../markdown";
import { toBibtex } from "../data/derive";
import { ArrowRight, OpenExternal, Copy } from "../icons";
import "./Inspector.css";

function kindLabel(n: Note) {
  return n.kind === "source" ? "Source" : "Article";
}

function LinkRow({ note, index }: { note: Note; index: number }) {
  const openArticle = useVault((s) => s.openArticle);
  return (
    <button
      className="link-row"
      style={{ animationDelay: `${Math.min(index * 18, 260)}ms` }}
      onClick={() => openArticle(note.id)}
    >
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
  const notesById = useVault((s) => s.notesById);
  const linksOf = useVault((s) => s.linksOf);
  const backlinksOf = useVault((s) => s.backlinksOf);
  const openArticle = useVault((s) => s.openArticle);
  const openTag = useVault((s) => s.openTag);
  const scrollToHeading = useVault((s) => s.scrollToHeading);
  const citeMap = useVault((s) => s.citeMap);
  const toast = useVault((s) => s.toast);

  const width = useVault((s) => s.inspectorWidth);
  const note = notesById.get(selectedId);
  if (!note) return <aside className="inspector" style={{ width, minWidth: width }} />;

  const links = linksOf(note.id);
  const backlinks = backlinksOf(note.id);
  const tags = parseTags(note.content ?? "");
  const headings = parseHeadings(note.content ?? "").filter((h) => h.level > 1);
  const citations = parseCitations(note.content ?? "")
    .map((k) => citeMap.get(k))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const copyBibtex = () => {
    navigator.clipboard?.writeText(citations.map(toBibtex).join("\n\n"));
    toast(`Copied ${citations.length} BibTeX ${citations.length === 1 ? "entry" : "entries"}`);
  };

  return (
    <aside className="inspector" style={{ width, minWidth: width }}>
      <div className="insp-scroll" key={selectedId}>
        <div className="insp-eyebrow">{note.kind === "source" ? "SOURCE" : "ARTICLE"}</div>
        <h2 className="insp-title">{note.title}</h2>
        <div className="insp-meta">{note.kind === "source" ? "Source" : "Note"}</div>

        <button className="open-btn" onClick={() => openArticle(note.id)}>
          <OpenExternal size={15} />
          <span>Open {note.kind === "source" ? "Source" : "Article"}</span>
        </button>

        {tags.length > 0 && (
          <div className="insp-tags">
            {tags.map((t) => (
              <button key={t} className="tag-pill" onClick={() => openTag(t)}>
                #{t}
              </button>
            ))}
          </div>
        )}

        {headings.length >= 2 && (
          <section className="link-section">
            <div className="section-label">On this page</div>
            <div className="outline">
              {headings.map((h, i) => (
                <button
                  key={`${h.slug}-${i}`}
                  className="outline-row"
                  style={{ paddingLeft: 2 + (h.level - 2) * 14 }}
                  onClick={() => scrollToHeading(h.slug)}
                >
                  {h.text}
                </button>
              ))}
            </div>
          </section>
        )}

        {citations.length > 0 && (
          <section className="link-section">
            <div className="section-label spread">
              <span>References ({citations.length})</span>
              <button className="mini-btn" onClick={copyBibtex} title="Copy BibTeX">
                <Copy size={13} />
                BibTeX
              </button>
            </div>
            <div className="link-list">
              {citations.map((c, i) => (
                <button
                  key={c.key}
                  className="link-row"
                  style={{ animationDelay: `${Math.min(i * 18, 260)}ms` }}
                  onClick={() => openArticle(c.id)}
                >
                  <span className="link-text">
                    <span className="link-title">{c.title}</span>
                    <span className="link-kind">
                      {c.label}
                      {c.venue ? ` · ${c.venue}` : ""}
                    </span>
                  </span>
                  <ArrowRight size={15} className="link-arrow" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="link-section">
          <div className="section-label">Links To ({links.length})</div>
          <div className="link-list">
            {links.length ? (
              links.map((n, i) => <LinkRow key={n.id} note={n} index={i} />)
            ) : (
              <div className="empty">No outgoing links.</div>
            )}
          </div>
        </section>

        <section className="link-section">
          <div className="section-label">Backlinks ({backlinks.length})</div>
          <div className="link-list">
            {backlinks.length ? (
              backlinks.map((n, i) => <LinkRow key={n.id} note={n} index={i} />)
            ) : (
              <div className="empty">No backlinks.</div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
