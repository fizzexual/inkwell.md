import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Note } from "../data/vault";
import { detectWikiTrigger } from "../autocomplete";
import { getCaretCoordinates } from "../caret";
import { fuzzyMatch } from "../fuzzy";
import { parseTags } from "../markdown";
import { Bold, Italic, Heading, ListIcon, Quote, Code, Link } from "../icons";
import "./MarkdownEditor.css";

interface Props {
  value: string;
  onChange: (v: string) => void;
  notes: Note[];
  selfId: string;
}

interface SlashCmd {
  label: string;
  hint: string;
  insert: string;
  caret: number; // caret offset within the inserted text
}

const SLASH_COMMANDS: SlashCmd[] = [
  { label: "Heading", hint: "## ", insert: "## ", caret: 3 },
  { label: "Subheading", hint: "### ", insert: "### ", caret: 4 },
  { label: "Bullet list", hint: "- ", insert: "- ", caret: 2 },
  { label: "Numbered list", hint: "1. ", insert: "1. ", caret: 3 },
  { label: "Checklist", hint: "- [ ] ", insert: "- [ ] ", caret: 6 },
  { label: "Quote", hint: "> ", insert: "> ", caret: 2 },
  { label: "Code block", hint: "``` ```", insert: "```\n\n```", caret: 4 },
  { label: "Table", hint: "grid", insert: "| Column | Column |\n| --- | --- |\n|  |  |", caret: 2 },
  { label: "Divider", hint: "---", insert: "---\n", caret: 4 },
  { label: "Wiki link", hint: "[[ ]]", insert: "[[]]", caret: 2 },
  { label: "Embed note", hint: "![[ ]]", insert: "![[]]", caret: 3 },
];

type Popup =
  | { kind: "link"; from: number; to: number; items: { id: string; title: string }[]; index: number; top: number; left: number }
  | { kind: "slash"; from: number; to: number; items: SlashCmd[]; index: number; top: number; left: number }
  | { kind: "tag"; from: number; to: number; items: string[]; index: number; top: number; left: number };

function detectSlash(value: string, caret: number): { query: string; from: number } | null {
  const m = value.slice(0, caret).match(/(?:^|\s)\/([a-zA-Z]*)$/);
  if (!m) return null;
  return { query: m[1], from: caret - m[1].length - 1 };
}

function detectTag(value: string, caret: number): { query: string; from: number } | null {
  const m = value.slice(0, caret).match(/(?:^|\s)#([\w/-]*)$/);
  if (!m) return null;
  return { query: m[1], from: caret - m[1].length - 1 };
}

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "`": "`" };
const CLOSERS = new Set(Object.values(PAIRS));

export default function MarkdownEditor({ value, onChange, notes, selfId }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) for (const t of parseTags(n.content ?? "")) s.add(t);
    return [...s].sort();
  }, [notes]);

  const apply = (from: number, to: number, text: string, caret: number) => {
    const ta = ref.current;
    if (!ta) return;
    onChange(ta.value.slice(0, from) + text + ta.value.slice(to));
    setPopup(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(from + caret, from + caret);
    });
  };

  const surround = (left: string, right = left, placeholder = "text") => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    const sel = ta.value.slice(a, b) || placeholder;
    apply(a, b, left + sel + right, left.length + sel.length + right.length);
    requestAnimationFrame(() => ta.setSelectionRange(a + left.length, a + left.length + sel.length));
  };

  const prefixLine = (prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const a = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", a - 1) + 1;
    apply(lineStart, lineStart, prefix, prefix.length + (a - lineStart));
  };

  const coordsAt = (pos: number) => {
    const ta = ref.current!;
    const c = getCaretCoordinates(ta, pos);
    const rect = ta.getBoundingClientRect();
    return { top: rect.top + c.top + c.height + 4, left: rect.left + c.left };
  };

  const refresh = () => {
    const ta = ref.current;
    if (!ta) return setPopup(null);
    const caret = ta.selectionStart;

    const wiki = detectWikiTrigger(ta.value, caret);
    if (wiki) {
      const items = notes
        .filter((n) => n.id !== selfId)
        .map((n) => ({ n, m: fuzzyMatch(wiki.query, n.title) }))
        .filter((x) => x.m)
        .sort((a, b) => b.m!.score - a.m!.score)
        .slice(0, 8)
        .map((x) => ({ id: x.n.id, title: x.n.title }));
      if (items.length) {
        return setPopup({ kind: "link", from: wiki.start - 2, to: caret, items, index: 0, ...coordsAt(wiki.start - 2) });
      }
    }

    const slash = detectSlash(ta.value, caret);
    if (slash) {
      const items = SLASH_COMMANDS.filter((c) => fuzzyMatch(slash.query, c.label));
      if (items.length) {
        return setPopup({ kind: "slash", from: slash.from, to: caret, items, index: 0, ...coordsAt(slash.from) });
      }
    }

    const tag = detectTag(ta.value, caret);
    if (tag) {
      const q = tag.query.toLowerCase();
      const items = allTags.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
      if (items.length && !(items.length === 1 && items[0].toLowerCase() === q)) {
        return setPopup({ kind: "tag", from: tag.from, to: caret, items, index: 0, ...coordsAt(tag.from) });
      }
    }

    setPopup(null);
  };

  const accept = (p: Popup, i: number) => {
    if (p.kind === "link") {
      const title = p.items[i].title;
      apply(p.from, p.to, `[[${title}]]`, title.length + 4);
    } else if (p.kind === "tag") {
      const tag = p.items[i];
      apply(p.from, p.to, `#${tag} `, tag.length + 2);
    } else {
      const cmd = p.items[i];
      apply(p.from, p.to, cmd.insert, cmd.caret);
    }
  };

  const autoPair = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const close = PAIRS[e.key];
    if (close) {
      e.preventDefault();
      if (a !== b) {
        const sel = value.slice(a, b);
        onChange(value.slice(0, a) + e.key + sel + close + value.slice(b));
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(a + 1, a + 1 + sel.length);
        });
      } else {
        apply(a, b, e.key + close, 1);
      }
    } else if (CLOSERS.has(e.key) && value[a] === e.key && a === b) {
      // type over an auto-inserted closer
      e.preventDefault();
      requestAnimationFrame(() => ta.setSelectionRange(a + 1, a + 1));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "b" || e.key === "i")) {
      e.preventDefault();
      e.stopPropagation();
      surround(e.key === "b" ? "**" : "_");
      return;
    }
    if (popup) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPopup({ ...popup, index: Math.min(popup.index + 1, popup.items.length - 1) });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setPopup({ ...popup, index: Math.max(popup.index - 1, 0) });
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        accept(popup, popup.index);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPopup(null);
      }
      return;
    }
    if (!mod && !e.altKey) autoPair(e);
  };

  return (
    <div className="md-edit-root">
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
        <span className="tb-hint">/ commands · [[ link · # tag · ⌘B/⌘I</span>
      </div>

      <div className="md-editor-scroll">
        <textarea
          ref={ref}
          className="md-editor"
          value={value}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            requestAnimationFrame(refresh);
          }}
          onKeyUp={refresh}
          onClick={refresh}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setPopup(null), 150)}
          placeholder="Write in markdown… type / for commands, [[ to link, ![[ to embed."
        />
      </div>

      {popup && (
        <div
          className="ac-popup"
          style={{ top: popup.top, left: popup.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {popup.kind === "link" &&
            popup.items.map((it, i) => (
              <button
                key={it.id}
                className={"ac-item" + (i === popup.index ? " active" : "")}
                onMouseEnter={() => setPopup({ ...popup, index: i })}
                onClick={() => accept(popup, i)}
              >
                <Link size={13} />
                <span>{it.title}</span>
              </button>
            ))}
          {popup.kind === "slash" &&
            popup.items.map((it, i) => (
              <button
                key={it.label}
                className={"ac-item" + (i === popup.index ? " active" : "")}
                onMouseEnter={() => setPopup({ ...popup, index: i })}
                onClick={() => accept(popup, i)}
              >
                <span>{it.label}</span>
                <span className="ac-hint">{it.hint}</span>
              </button>
            ))}
          {popup.kind === "tag" &&
            popup.items.map((it, i) => (
              <button
                key={it}
                className={"ac-item" + (i === popup.index ? " active" : "")}
                onMouseEnter={() => setPopup({ ...popup, index: i })}
                onClick={() => accept(popup, i)}
              >
                <span className="ac-tag">#{it}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
