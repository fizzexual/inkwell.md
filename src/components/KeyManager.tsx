import { useEffect } from "react";
import { useChat } from "../ai/useChat";
import { PROVIDERS } from "../ai/providers";
import "./KeyManager.css";

export default function KeyManager() {
  const open = useChat((s) => s.keyManagerOpen);
  const setOpen = useChat((s) => s.setKeyManagerOpen);
  const keys = useChat((s) => s.keys);
  const active = useChat((s) => s.provider);
  const model = useChat((s) => s.model);
  const setKey = useChat((s) => s.setKey);
  const setProvider = useChat((s) => s.setProvider);
  const setModel = useChat((s) => s.setModel);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="km-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="km" onMouseDown={(e) => e.stopPropagation()}>
        <header className="km-head">
          <h2>AI providers &amp; keys</h2>
          <button className="km-x" aria-label="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </header>
        <p className="km-intro">
          Pick a provider and paste its API key. Keys are stored only in this browser, never uploaded.{" "}
          <b>Groq</b> is the easiest free pick — fast and no credit card.
        </p>

        <div className="km-list">
          {PROVIDERS.map((p) => {
            const isActive = p.id === active;
            const hasKey = !!(keys[p.id] || "").trim();
            return (
              <div
                key={p.id}
                className={"km-card" + (isActive ? " active" : "")}
                onClick={() => setProvider(p.id)}
              >
                <div className="km-card-head">
                  <span className={"km-radio" + (isActive ? " on" : "")} />
                  <span className="km-name">{p.label}</span>
                  {p.recommended ? (
                    <span className="km-badge rec">Free · recommended</span>
                  ) : p.keyless ? (
                    <span className="km-badge free">Local · no key</span>
                  ) : p.free ? (
                    <span className="km-badge free">Free tier</span>
                  ) : (
                    <span className="km-badge paid">Paid</span>
                  )}
                  {hasKey && !p.keyless && <span className="km-badge key">key set</span>}
                </div>
                <p className="km-note">{p.note}</p>
                {p.keyless ? (
                  <div className="km-key-row" onClick={(e) => e.stopPropagation()}>
                    <span className="km-local">No API key needed — runs on your machine.</span>
                    <a href={p.keyUrl} target="_blank" rel="noreferrer">
                      Install ↗
                    </a>
                  </div>
                ) : (
                  <div className="km-key-row" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="password"
                      value={keys[p.id] || ""}
                      placeholder={p.keyHint}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(e) => setKey(p.id, e.target.value)}
                    />
                    <a href={p.keyUrl} target="_blank" rel="noreferrer">
                      Get a key ↗
                    </a>
                  </div>
                )}
                {isActive && (
                  <div className="km-model" onClick={(e) => e.stopPropagation()}>
                    <label>Model</label>
                    <select value={model} onChange={(e) => setModel(e.target.value)}>
                      {p.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
