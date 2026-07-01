import { useEffect, useState } from "react";
import { useChat } from "../ai/useChat";
import { PROVIDERS } from "../ai/providers";
import { Eye, EyeOff, Copy, Check, Trash2, KeyRound } from "lucide-react";
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
  const fetchedModels = useChat((s) => s.fetchedModels);
  const modelsLoading = useChat((s) => s.modelsLoading);
  const modelsError = useChat((s) => s.modelsError);
  const loadModels = useChat((s) => s.loadModels);

  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    loadModels(active); // pull the live model list for the active provider
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, active, setOpen, loadModels]);

  // reset the "reveal keys" state each time the manager is closed, so keys aren't left on screen
  useEffect(() => {
    if (!open) setReveal(false);
  }, [open]);

  if (!open) return null;

  const savedCount = PROVIDERS.filter((p) => !p.keyless && (keys[p.id] || "").trim()).length;

  const copyKey = async (id: string) => {
    const v = (keys[id] || "").trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="km-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="km" onMouseDown={(e) => e.stopPropagation()}>
        <header className="km-head">
          <h2>AI providers &amp; keys</h2>
          <div className="km-head-actions">
            <button
              className={"km-reveal" + (reveal ? " on" : "")}
              onClick={() => setReveal((r) => !r)}
              title={reveal ? "Hide keys" : "Show keys"}
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{reveal ? "Hide keys" : "Show keys"}</span>
            </button>
            <button className="km-x" aria-label="Close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
        </header>

        <div className="km-saved-bar">
          <KeyRound size={14} />
          {savedCount > 0 ? (
            <span>
              <b>
                {savedCount} key{savedCount === 1 ? "" : "s"} saved
              </b>{" "}
              · kept in this browser and remembered across sessions — you won't need to re-enter them.
            </span>
          ) : (
            <span>No keys saved yet. Add one below and it stays saved on this device (never uploaded).</span>
          )}
        </div>

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
                  {hasKey && !p.keyless && (
                    <span className="km-badge key">
                      <Check size={11} /> saved
                    </span>
                  )}
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
                      type={reveal ? "text" : "password"}
                      value={keys[p.id] || ""}
                      placeholder={p.keyHint}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(e) => setKey(p.id, e.target.value)}
                    />
                    {hasKey && (
                      <>
                        <button
                          className="km-key-btn"
                          title={copied === p.id ? "Copied" : "Copy key"}
                          onClick={() => copyKey(p.id)}
                        >
                          {copied === p.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button
                          className="km-key-btn danger"
                          title="Remove saved key"
                          onClick={() => setKey(p.id, "")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    <a href={p.keyUrl} target="_blank" rel="noreferrer">
                      {hasKey ? "Manage ↗" : "Get a key ↗"}
                    </a>
                  </div>
                )}
                {isActive &&
                  (() => {
                    const live = fetchedModels[p.id];
                    const base = live && live.length ? live : p.models;
                    const opts = base.some((m) => m.id === model) ? base : [{ id: model, label: model }, ...base];
                    const loading = modelsLoading[p.id];
                    const err = modelsError[p.id];
                    return (
                      <div className="km-model" onClick={(e) => e.stopPropagation()}>
                        <label>
                          Model
                          {loading ? " · loading…" : live && live.length ? ` · ${live.length} live` : ""}
                        </label>
                        <select value={model} onChange={(e) => setModel(e.target.value)}>
                          {opts.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="km-refresh"
                          title={err ? `Couldn't list models (${err}). Click to retry.` : "Refresh model list"}
                          onClick={() => loadModels(p.id, true)}
                        >
                          ↻
                        </button>
                      </div>
                    );
                  })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
