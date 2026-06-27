import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useVault } from "../store/useVault";
import { renderMarkdown } from "../markdown";
import { detectWikiTrigger } from "../autocomplete";
import { getCaretCoordinates } from "../caret";
import { fuzzyMatch } from "../fuzzy";
import { Graph, Pencil, Doc, Bold, Italic, Heading, ListIcon, Quote, Code, Link } from "../icons";
import "./ArticleView.css";

interface AcState {
  start: number; // index of the first query char (after `[[`)
  items: { id: string; title: string }[];
  index: number;
  top: number;
  left: number;
}

function wordCount(md: string): number {
  const text = md.replace(/[#>*`_\-[\]|]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

export default function ArticleView() {
  const selectedId = useVault((s) => s.selectedId);
  const notes = useVault((s) => s.notes);
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
  const words = wordCount(md);
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

  // ---- [[ wikilink autocomplete ----
  const [ac, setAc] = useState<AcState | null>(null);

  const refreshAc = () => {
    const ta = taRef.current;
    if (!ta) return setAc(null);
    const trigger = detectWikiTrigger(ta.value, ta.selectionStart);
    if (!trigger) return setAc(null);
    const items = notes
      .filter((n) => n.id !== selectedId)
      .map((n) => ({ n, m: fuzzyMatch(trigger.query, n.title) }))
      .filter((x) => x.m)
      .sort((a, b) => b.m!.score - a.m!.score)
      .slice(0, 8)
      .map((x) => ({ id: x.n.id, title: x.n.title }));
    if (!items.length) return setAc(null);
    const c = getCaretCoordinates(ta, trigger.start - 2);
    const rect = ta.getBoundingClientRect();
    setAc({ start: trigger.start, items, index: 0, top: rect.top + c.top + c.height + 4, left: rect.left + c.left });
  };

  const acceptAc = (title: string) => {
    const ta = taRef.current;
    if (!ta || !ac) return;
    const before = ta.value.slice(0, ac.start - 2);
    const after = ta.value.slice(ta.selectionStart);
    const insert = `[[${title}]]`;
    updateContent(selectedId, before + insert + after);
    const pos = before.length + insert.length;
    setAc(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const onEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!ac) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAc({ ...ac, index: Math.min(ac.index + 1, ac.items.length - 1) });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAc({ ...ac, index: Math.max(ac.index - 1, 0) });
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      acceptAc(ac.items[ac.index].title);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setAc(null);
    }
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
            onChange={(e) => {
              updateContent(selectedId, e.target.value);
              requestAnimationFrame(refreshAc);
            }}
            onKeyUp={refreshAc}
            onClick={refreshAc}
            onKeyDown={onEditorKeyDown}
            onBlur={() => window.setTimeout(() => setAc(null), 150)}
            placeholder="Write in markdown… use [[Note Title]] to link."
          />
        ) : (
          <div
            key={selectedId}
            className="md-preview"
            onClick={onPreviewClick}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      {ac && (
        <div
          className="ac-popup"
          style={{ top: ac.top, left: ac.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {ac.items.map((it, i) => (
            <button
              key={it.id}
              className={"ac-item" + (i === ac.index ? " active" : "")}
              onMouseEnter={() => setAc({ ...ac, index: i })}
              onClick={() => acceptAc(it.title)}
            >
              <Link size={13} />
              <span>{it.title}</span>
            </button>
          ))}
        </div>
      )}

      <footer className="article-footer">
        <span>{note.kind === "source" ? "Source" : "Note"}</span>
        <span className="dot-sep">·</span>
        <span>{words} words</span>
        <span className="dot-sep">·</span>
        <span>{Math.max(1, Math.round(words / 200))} min read</span>
        <span className="dot-sep">·</span>
        <span>{editing ? "Editing" : "Reading"}</span>
      </footer>
    </main>
  );
}
