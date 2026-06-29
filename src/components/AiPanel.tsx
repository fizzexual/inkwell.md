import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { useChat } from "../ai/useChat";
import { useVault } from "../store/useVault";
import { getProvider } from "../ai/providers";
import { Sparkles, Send, Stop, Trash, Search, Graph, Doc, ChevronRight, Palette, Clock, Pencil } from "../icons";
import "./AiPanel.css";

const EXAMPLES = [
  "Summarise what this vault is about",
  "How does linking between notes work?",
  "What can the Math Engine do?",
];

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderAnswer(md: string): string {
  const withLinks = md.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, t) => `<a class="ai-link" data-title="${escapeAttr(t)}">${t}</a>`,
  );
  return marked.parse(withLinks, { async: false }) as string;
}

const STEP_ICON = { search: Search, links: Graph, read: Doc, wait: Clock } as const;
const STEP_VERB = { search: "Searching", links: "Following links from", read: "Reading", wait: "" } as const;

export default function AiPanel() {
  const toggleAi = useVault((s) => s.toggleAi);
  const openArticle = useVault((s) => s.openArticle);
  const resolve = useVault((s) => s.resolve);

  const providerId = useChat((s) => s.provider);
  const keys = useChat((s) => s.keys);
  const model = useChat((s) => s.model);
  const messages = useChat((s) => s.messages);
  const steps = useChat((s) => s.steps);
  const status = useChat((s) => s.status);
  const sessionTokens = useChat((s) => s.sessionTokens);
  const error = useChat((s) => s.error);
  const canWrite = useChat((s) => s.canWrite);
  const setCanWrite = useChat((s) => s.setCanWrite);
  const proposals = useChat((s) => s.proposals);
  const applyProposal = useChat((s) => s.applyProposal);
  const rejectProposal = useChat((s) => s.rejectProposal);
  const setModel = useChat((s) => s.setModel);
  const setKeyManagerOpen = useChat((s) => s.setKeyManagerOpen);
  const send = useChat((s) => s.send);
  const stop = useChat((s) => s.stop);
  const clear = useChat((s) => s.clear);

  const fetched = useChat((s) => s.fetchedModels[providerId]);
  const loadModels = useChat((s) => s.loadModels);

  const provider = getProvider(providerId);
  const hasKey = !!provider.keyless || !!(keys[providerId] || "").trim();

  // show the provider's LIVE model list once loaded; fall back to the curated one
  const modelOptions = useMemo(() => {
    const base = fetched && fetched.length ? fetched : provider.models;
    return base.some((m) => m.id === model) ? base : [{ id: model, label: model }, ...base];
  }, [fetched, provider, model]);

  useEffect(() => {
    if (hasKey) loadModels(providerId);
  }, [providerId, hasKey, loadModels]);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, steps, status]);

  const submit = () => {
    if (!draft.trim()) return;
    send(draft);
    setDraft("");
  };

  const onLinkClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest(".ai-link") as HTMLElement | null;
    if (!a) return;
    e.preventDefault();
    const id = resolve(a.dataset.title || "");
    if (id) openArticle(id);
  };

  return (
    <aside className="ai-panel">
      <header className="ai-head">
        <div className="ai-title">
          <Sparkles size={15} />
          <span>Assistant</span>
          {sessionTokens > 0 && (
            <span className="ai-session" title="Tokens used this chat">
              {sessionTokens >= 1000 ? `${(sessionTokens / 1000).toFixed(1)}k` : sessionTokens} tok
            </span>
          )}
        </div>
        <div className="ai-head-actions">
          <select className="ai-model" value={model} onChange={(e) => setModel(e.target.value)} title="Model">
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            className={"ai-icon-btn" + (canWrite ? " on" : "")}
            title={canWrite ? "Allow edits: ON (agent can propose changes)" : "Allow edits: OFF (read-only)"}
            onClick={() => setCanWrite(!canWrite)}
          >
            <Pencil size={14} />
          </button>
          <button className="ai-icon-btn" title="API keys & providers" onClick={() => setKeyManagerOpen(true)}>
            <Palette size={14} />
          </button>
          <button className="ai-icon-btn" title="Clear chat" onClick={clear} disabled={!messages.length}>
            <Trash size={14} />
          </button>
          <button className="ai-icon-btn" title="Close" onClick={toggleAi}>
            <ChevronRight size={15} />
          </button>
        </div>
      </header>

      <div className="ai-scroll" ref={scrollRef} onClick={onLinkClick}>
        {messages.length === 0 && (
          <div className="ai-empty">
            <Sparkles size={22} />
            <p className="ai-empty-lead">Ask anything about your vault.</p>
            <p className="ai-empty-sub">
              I navigate your notes through the knowledge graph — reading only the few that matter, not the
              whole vault.
            </p>
            {!hasKey ? (
              <button className="ai-setup" onClick={() => setKeyManagerOpen(true)}>
                Set up an API key — free options available
              </button>
            ) : (
              <div className="ai-examples">
                {EXAMPLES.map((q) => (
                  <button key={q} onClick={() => send(q)} disabled={status === "running"}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ai-msg ai-user">
              {m.content}
            </div>
          ) : (
            <div key={i} className="ai-bot-wrap">
              <div className="ai-msg ai-bot" dangerouslySetInnerHTML={{ __html: renderAnswer(m.content) }} />
              {m.meta && (
                <div className="ai-meta">
                  <Clock size={11} />
                  {(m.meta.ms / 1000).toFixed(1)}s
                  {m.meta.tokens > 0 && <> · {m.meta.tokens.toLocaleString()} tokens</>}
                </div>
              )}
            </div>
          ),
        )}

        {proposals.map((p) => (
          <div key={p.id} className="ai-proposal">
            <div className="ai-prop-head">
              <span className={"ai-prop-kind " + p.kind}>{p.kind === "create" ? "New note" : "Edit"}</span>
              <span className="ai-prop-title">{p.title}</span>
            </div>
            <pre className="ai-prop-body">{p.content.slice(0, 600)}{p.content.length > 600 ? "\n…" : ""}</pre>
            <div className="ai-prop-actions">
              <button className="ai-prop-reject" onClick={() => rejectProposal(p.id)}>
                Reject
              </button>
              <button className="ai-prop-approve" onClick={() => applyProposal(p.id)}>
                {p.kind === "create" ? "Create note" : "Apply edit"}
              </button>
            </div>
          </div>
        ))}

        {status === "running" && (
          <div className="ai-steps">
            {steps.map((s, i) => {
              const Icon = STEP_ICON[s.kind];
              return (
                <div key={i} className="ai-step">
                  <Icon size={13} />
                  <span>
                    {STEP_VERB[s.kind]} <b>{s.detail}</b>
                  </span>
                </div>
              );
            })}
            <div className="ai-step ai-thinking">
              <span className="ai-dot" />
              <span className="ai-dot" />
              <span className="ai-dot" />
            </div>
          </div>
        )}

        {error && (
          <div className="ai-error">
            {error}
            <button className="ai-error-fix" onClick={() => setKeyManagerOpen(true)}>
              Open key manager
            </button>
          </div>
        )}
      </div>

      <div className="ai-input">
        <button className="ai-gear" title="API keys & providers" onClick={() => setKeyManagerOpen(true)}>
          ⚙
        </button>
        <textarea
          value={draft}
          rows={1}
          placeholder={hasKey ? `Ask your vault… · ${provider.label}` : "Add a key to start…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {status === "running" ? (
          <button className="ai-send stop" title="Stop" onClick={stop}>
            <Stop size={15} />
          </button>
        ) : (
          <button className="ai-send" title="Send" onClick={submit} disabled={!draft.trim()}>
            <Send size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}
