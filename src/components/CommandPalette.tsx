import { useEffect, useMemo, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { fuzzyMatch } from "../fuzzy";
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

  const results = useMemo(() => {
    const scored = notes
      .map((n) => ({ note: n, m: fuzzyMatch(query, n.title) }))
      .filter((r) => r.m !== null)
      .sort((a, b) => b.m!.score - a.m!.score)
      .slice(0, 50);
    return scored;
  }, [notes, query]);

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
          {results.length === 0 && <div className="palette-empty">No matching notes.</div>}
          {results.map((r, i) => (
            <button
              key={r.note.id}
              className={"palette-item" + (i === active ? " active" : "")}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r.note.id)}
            >
              {r.note.kind === "source" ? <Sources size={15} /> : <Doc size={15} />}
              <span className="palette-title">
                <Highlight text={r.note.title} ranges={r.m!.ranges} />
              </span>
              <span className="palette-folder">{r.note.folder || "/"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
