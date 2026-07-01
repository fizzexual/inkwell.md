import { useMemo } from "react";
import { useVault } from "../store/useVault";
import type { Note } from "../data/vault";
import { parseTags, parseHeadings, parseCitations } from "../markdown";
import { toBibtex, aliasesOf } from "../data/derive";
import { ArrowRight, OpenExternal, Copy, Link } from "../icons";
import "./Inspector.css";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  const notes = useVault((s) => s.notes);
  const notesById = useVault((s) => s.notesById);
  const linksOf = useVault((s) => s.linksOf);
  const backlinksOf = useVault((s) => s.backlinksOf);
  const openArticle = useVault((s) => s.openArticle);
  const openTag = useVault((s) => s.openTag);
  const updateContent = useVault((s) => s.updateContent);
  const scrollToHeading = useVault((s) => s.scrollToHeading);
  const citeMap = useVault((s) => s.citeMap);
  const toast = useVault((s) => s.toast);

  const width = useVault((s) => s.inspectorWidth);
  const note = notesById.get(selectedId);

  // unlinked mentions: other note titles that appear as plain prose but aren't linked yet.
  // Ignore code blocks, inline code, frontmatter and existing links when detecting.
  const mentions = useMemo(() => {
    if (!note) return [];
    const stripped = (note.content ?? "")
      .replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]+`/g, "")
      .replace(/\[\[[^\]]+\]\]/g, "");
    return notes
      .filter((n) => n.id !== note.id && n.title.length >= 4)
      .filter((n) => new RegExp(`(^|[^\\w[])${escapeRe(n.title)}(?![\\w\\]])`, "i").test(stripped))
      .slice(0, 8);
  }, [note, notes]);

  if (!note) return <aside className="inspector" style={{ width, minWidth: width }} />;

  // apply [[link]] to the first prose occurrence of each title — code segments are left untouched
  const applyLinks = (titles: string[]) => {
    const parts = (note.content ?? "").split(/(```[\s\S]*?```|`[^`\n]+`)/);
    const done = new Set<string>();
    for (let i = 0; i < parts.length; i += 2) {
      for (const title of titles) {
        if (done.has(title)) continue;
        const re = new RegExp(`(^|[^\\w[])(${escapeRe(title)})(?![\\w\\]])`, "i");
        const before = parts[i];
        parts[i] = before.replace(re, (_m, pre: string) => `${pre}[[${title}]]`);
        if (parts[i] !== before) done.add(title);
      }
    }
    return parts.join("");
  };
  const linkMention = (title: string) => {
    updateContent(note.id, applyLinks([title]));
    toast(`Linked “${title}”`);
  };
  const linkAll = () => {
    updateContent(note.id, applyLinks(mentions.map((m) => m.title)));
    toast(`Linked ${mentions.length} mention${mentions.length === 1 ? "" : "s"}`);
  };

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
        {aliasesOf(note).length > 0 && (
          <div className="insp-aliases">
            {aliasesOf(note).map((a) => (
              <span key={a} className="alias-pill">
                {a}
              </span>
            ))}
          </div>
        )}

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

        {mentions.length > 0 && (
          <section className="link-section">
            <div className="section-label spread">
              <span>Unlinked mentions ({mentions.length})</span>
              <button
                className="mini-btn"
                title="Link all mentions"
                onClick={linkAll}
              >
                <Link size={13} />
                Link all
              </button>
            </div>
            <div className="link-list">
              {mentions.map((m) => (
                <div key={m.id} className="mention-row">
                  <button className="mention-open" onClick={() => openArticle(m.id)} title={m.title}>
                    {m.title}
                  </button>
                  <button className="mention-link" onClick={() => linkMention(m.title)} title="Insert [[link]]">
                    <Link size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
