import { useEffect, useMemo, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { fuzzyMatch } from "../fuzzy";
import { aliasesOf } from "../data/derive";
import { Search, Doc, Sources } from "../icons";
import "./CommandPalette.css";

function Highlight({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (!ranges.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([a, b], i) => {
    if (a > cursor) parts.push(text.slice(cursor, a));
    parts.push(<mark key={i}>{text.slice(a, b)}</mark>);
    cursor = b;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export default function CommandPalette() {
  const open = useVault((s) => s.paletteOpen);
  const setOpen = useVault((s) => s.setPaletteOpen);
  const notes = useVault((s) => s.notes);
  const history = useVault((s) => s.history);
  const openArticle = useVault((s) => s.openArticle);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const recentEmpty = query.trim() === "";

  const results = useMemo(() => {
    if (recentEmpty) {
      // most recently visited notes, newest first, de-duplicated
      const byId = new Map(notes.map((n) => [n.id, n]));
      const seen = new Set<string>();
      const out: { note: (typeof notes)[number]; m: { score: number; ranges: [number, number][] }; alias: undefined }[] = [];
      for (let i = history.length - 1; i >= 0 && out.length < 12; i--) {
        const id = history[i];
        if (seen.has(id)) continue;
        seen.add(id);
        const n = byId.get(id);
        if (n) out.push({ note: n, m: { score: 0, ranges: [] }, alias: undefined });
      }
      return out;
    }
    return notes
      .map((n) => {
        const onTitle = fuzzyMatch(query, n.title);
        if (onTitle) return { note: n, m: onTitle, alias: undefined as string | undefined };
        // fall back to matching an alias (no title highlight)
        for (const a of aliasesOf(n)) {
          const am = fuzzyMatch(query, a);
          if (am) return { note: n, m: { score: am.score, ranges: [] }, alias: a };
        }
        return null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.m.score - a.m.score)
      .slice(0, 50);
  }, [notes, query, history, recentEmpty]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results, active]);

  if (!open) return null;

  const choose = (id?: string) => {
    const target = id ?? results[active]?.note.id;
    if (target) {
      openArticle(target);
      setOpen(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Jump to a note…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-results">
          {recentEmpty && results.length > 0 && <div className="palette-section">Recent</div>}
          {results.length === 0 && <div className="palette-empty">No matching notes.</div>}
          {results.map((r, i) => (
            <button
              key={r.note.id}
              className={"palette-item" + (i === active ? " active" : "")}
              style={{ animationDelay: `${Math.min(i * 16, 220)}ms` }}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r.note.id)}
            >
              {r.note.kind === "source" ? <Sources size={15} /> : <Doc size={15} />}
              <span className="palette-title">
                <Highlight text={r.note.title} ranges={r.m.ranges} />
                {r.alias && <span className="palette-alias"> · {r.alias}</span>}
              </span>
              <span className="palette-folder">{r.note.folder || "/"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
