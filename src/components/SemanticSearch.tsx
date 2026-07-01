import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { semanticSearch, isModelReady, type LoadProgress, type SemanticHit } from "../search/semantic";
import { Sparkles } from "../icons";
import "./SemanticSearch.css";

const strip = (md: string) =>
  md
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^#\s+.*$/m, "")
    .replace(/[#>*`_[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export default function SemanticSearch() {
  const open = useVault((s) => s.semanticOpen);
  const setOpen = useVault((s) => s.setSemanticOpen);
  const seed = useVault((s) => s.semanticSeed);
  const notes = useVault((s) => s.notes);
  const notesById = useVault((s) => s.notesById);
  const openArticle = useVault((s) => s.openArticle);

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SemanticHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [ready, setReady] = useState(isModelReady());
  const [ran, setRan] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const runId = useRef(0);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else {
      setProgress(null);
      setBusy(false);
    }
  }, [open]);

  const run = async (query: string) => {
    const text = query.trim();
    if (!text) {
      setHits([]);
      setRan(false);
      return;
    }
    const my = ++runId.current;
    setBusy(true);
    setRan(true);
    try {
      const results = await semanticSearch(text, notes, 12, (p) => {
        if (my === runId.current) setProgress(p);
      });
      if (my !== runId.current) return; // a newer search superseded this one
      setHits(results);
      setReady(true);
    } catch (e) {
      if (my === runId.current) {
        console.error(e);
        setProgress({ stage: "ready" });
      }
    } finally {
      if (my === runId.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  // once the model + index are warm, search live as you type; before that, wait for an explicit Enter
  const onChange = (val: string) => {
    setQ(val);
    if (debounce.current) clearTimeout(debounce.current);
    if (ready && val.trim()) debounce.current = setTimeout(() => run(val), 220);
  };

  // a query handed over from the command palette: pre-fill and search immediately
  useEffect(() => {
    if (open && seed) {
      setQ(seed);
      run(seed);
      useVault.setState({ semanticSeed: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  if (!open) return null;

  const pct = progress?.ratio != null ? Math.round(progress.ratio * 100) : null;

  return (
    <div className="sem-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="sem" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sem-search">
          <Sparkles size={16} />
          <input
            ref={inputRef}
            className="sem-input"
            value={q}
            placeholder="Search by meaning — e.g. “how do I stay focused while writing”"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                run(q);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <button className="sem-x" onClick={() => setOpen(false)} aria-label="Close">
            ✕
          </button>
        </div>

        {busy && (
          <div className="sem-status">
            <span className="sem-spin" />
            <span>
              {progress?.stage === "download"
                ? `Downloading the on-device model… ${pct ?? 0}%`
                : progress?.stage === "embedding"
                  ? `Indexing your notes… ${pct ?? 0}%`
                  : "Thinking…"}
            </span>
            {!ready && progress?.stage === "download" && (
              <span className="sem-note">first run only — it's cached afterwards</span>
            )}
          </div>
        )}

        {!busy && ran && hits.length === 0 && <div className="sem-empty">No notes matched that meaning.</div>}

        {!busy && !ran && (
          <div className="sem-hint">
            Finds notes by <b>meaning</b>, not just keywords — everything runs privately on your device.
          </div>
        )}

        {hits.length > 0 && (
          <ul className="sem-results">
            {hits.map((h) => {
              const n = notesById.get(h.id);
              if (!n) return null;
              return (
                <li key={h.id}>
                  <button
                    className="sem-item"
                    onClick={() => {
                      openArticle(h.id);
                      setOpen(false);
                    }}
                  >
                    <div className="sem-item-head">
                      <span className="sem-title">{n.title}</span>
                      {n.folder && <span className="sem-folder">{n.folder.replace(/^\d+\s*-\s*/, "")}</span>}
                      <span className="sem-score" title="semantic similarity">
                        <span className="sem-score-bar" style={{ width: `${Math.max(6, Math.round(h.score * 100))}%` }} />
                      </span>
                    </div>
                    <span className="sem-snippet">{strip(n.content ?? "").slice(0, 130) || "empty note"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
