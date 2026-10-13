import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useVault } from "../store/useVault";
import { renderMermaid } from "../renderCtx";
import { useNoteHtml } from "../useNoteHtml";
import { onPdfLinkClick, PDF_LINK } from "../pdfLinks";
import "./LiveEditor.css";

interface Props {
  value: string;
  onChange: (v: string) => void;
  noteId: string;
}

/** A block = a run of non-blank lines, with the char offset where it starts in the source. */
interface Blk {
  text: string;
  start: number;
}

/**
 * Split markdown into blocks separated by blank lines, keeping fenced code blocks whole.
 * Each block records its exact start offset so edits can be spliced back byte-for-byte —
 * no HTML→markdown serialization, so the source can never be silently rewritten.
 */
function parseBlocks(md: string): Blk[] {
  const out: Blk[] = [];
  let offset = 0;
  let cur: string[] = [];
  let curStart = 0;
  let started = false;
  let inFence = false;
  let fence = "";

  const flush = () => {
    if (started) out.push({ text: cur.join("\n"), start: curStart });
    cur = [];
    started = false;
  };

  const lines = md.split("\n");
  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1; // +1 for the newline that split() removed
    const fenceM = line.match(/^\s*(```|~~~)/);

    if (inFence) {
      cur.push(line);
      if (fenceM && line.trim().startsWith(fence)) inFence = false;
      continue;
    }
    if (fenceM) {
      if (!started) {
        curStart = lineStart;
        started = true;
      }
      inFence = true;
      fence = fenceM[1];
      cur.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
    } else {
      if (!started) {
        curStart = lineStart;
        started = true;
      }
      cur.push(line);
    }
  }
  flush();
  return out.length ? out : [{ text: "", start: 0 }];
}

export default function LiveEditor({ value, onChange, noteId }: Props) {
  const theme = useVault((s) => s.theme);
  const openArticle = useVault((s) => s.openArticle);
  const openPdfLink = useVault((s) => s.openPdfLink);

  // the block currently being edited, identified by its (stable) start offset + live text
  const [active, setActive] = useState<{ start: number; text: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const docRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => parseBlocks(value), [value]);

  // same rendering as reading view (links, embeds, citations, math, ```query, ```bibliography),
  // each block redone only when its text or something it read changed — not on every keystroke
  const render = useNoteHtml(noteId, value);

  // React 19 rewrites innerHTML whenever the {__html} object changes, which would wipe drawn
  // diagrams on every keystroke. Reuse last render's object while a block's HTML is unchanged.
  const lastHtml = useRef(new Map<string, { __html: string }>());
  const nextHtml = new Map<string, { __html: string }>();
  const htmlOf = (text: string) => {
    const html = text.trim() ? render(text) : "<p></p>";
    const key = `${theme}|${html}`; // a theme switch redraws diagrams in the new theme
    const obj = lastHtml.current.get(key) ?? { __html: html };
    nextHtml.set(key, obj);
    return obj;
  };
  useEffect(() => {
    lastHtml.current = nextHtml;
    // draw any ```mermaid block that is new on the page (cheap no-op when there is none)
    if (docRef.current) renderMermaid(docRef.current, theme);
  });

  // grow the active textarea to fit its content so blocks read as one seamless page
  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [active?.text, active?.start]);

  const activeEnd = active ? active.start + active.text.length : -1;

  const activate = (b: Blk) => {
    setActive({ start: b.start, text: b.text });
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        const end = ta.value.length;
        ta.setSelectionRange(end, end); // caret at end of the block (click again to reposition)
      }
    });
  };

  const commit = () => setActive(null);

  const onEdit = (newText: string) => {
    if (!active) return;
    // splice ONLY this block's range; everything outside stays byte-identical
    const nextValue = value.slice(0, active.start) + newText + value.slice(active.start + active.text.length);
    setActive({ start: active.start, text: newText });
    onChange(nextValue);
  };

  const surround = (mark: string) => {
    const ta = taRef.current;
    if (!ta || !active) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    const sel = ta.value.slice(a, b) || "text";
    const next = ta.value.slice(0, a) + mark + sel + mark + ta.value.slice(b);
    onEdit(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(a + mark.length, a + mark.length + sel.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "b" || e.key === "i")) {
      e.preventDefault();
      e.stopPropagation();
      surround(e.key === "b" ? "**" : "_");
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      commit();
      taRef.current?.blur();
    }
  };

  const onBlockClick = (e: React.MouseEvent, b: Blk) => {
    // a page link `[p. 3](#/pdf/…)` is followed (by the click handler below), not edited
    if ((e.target as Element).closest?.(PDF_LINK)) return;
    // in live-edit mode a click means "edit this block", not "follow the link"
    e.preventDefault();
    activate(b);
  };

  // React keys must not change while you type: blocks above the edited one keep their start
  // offset, blocks below it keep their distance from the end of the note
  const renderBlock = (b: Blk, key: string | number = b.start) => {
    // the frontmatter block renders to nothing — show a clickable "Properties" affordance instead
    if (b.start === 0 && /^---\r?\n[\s\S]*?\r?\n---\s*$/.test(b.text)) {
      return (
        <div key={key} className="live-block live-frontmatter" onMouseDown={(e) => onBlockClick(e, b)}>
          <span className="live-fm-chip">Properties</span>
        </div>
      );
    }
    return (
      <div
        key={key}
        className={"live-block" + (b.text.trim() === "" ? " live-empty" : "")}
        onMouseDown={(e) => onBlockClick(e, b)}
        dangerouslySetInnerHTML={htmlOf(b.text)}
      />
    );
  };

  const before = active ? blocks.filter((b) => b.start < active.start) : blocks;
  const after = active ? blocks.filter((b) => b.start >= activeEnd) : [];

  // keep other rendered blocks' links navigable-looking but inert; only the doc container handles it
  const onContainerClick = (e: React.MouseEvent) => {
    // `[p. 12](#/pdf/Attachments/paper.pdf?page=12)` → that PDF at that page, as in reading view
    if (onPdfLinkClick(e, (rel, page) => void openPdfLink(rel, page))) return;
    if (active) return;
    const a = (e.target as HTMLElement).closest("a.wikilink, a.embed-head, a.cite") as HTMLElement | null;
    if (a?.dataset.note) {
      e.preventDefault();
      openArticle(a.dataset.note);
    }
  };

  return (
    <div className="live-root">
      <div className="live-doc md-preview" onClick={onContainerClick} key={noteId} ref={docRef}>
        {before.map((b) => renderBlock(b))}
        {active && (
          <textarea
            ref={taRef}
            className="live-active"
            value={active.text}
            spellCheck={false}
            autoFocus
            onChange={(e) => onEdit(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            placeholder="Write in markdown…"
          />
        )}
        {after.map((b) => renderBlock(b, `end-${value.length - b.start}`))}
      </div>
      {!active && blocks.length === 1 && blocks[0].text === "" && (
        <div className="live-hint" onMouseDown={() => activate(blocks[0])}>
          Click to start writing — this block becomes editable markdown, the rest stays formatted.
        </div>
      )}
    </div>
  );
}
