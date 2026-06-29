import { create } from "zustand";
import { useVault } from "../store/useVault";
import { runVaultAgent, type ChatMsg, type AgentStep, type VaultAccess, type Proposal } from "./agent";
import { PROVIDERS, getProvider } from "./providers";

const KEY = "inkwell.ai.v2";
const OLD_KEY = "inkwell.ai.v1";

interface Persisted {
  keys?: Record<string, string>;
  provider?: string;
  model?: string;
  messages?: ChatMsg[];
  canWrite?: boolean;
}

function load(): Persisted {
  try {
    const v2 = localStorage.getItem(KEY);
    if (v2) return JSON.parse(v2);
    // migrate a single Anthropic key from the previous version
    const v1 = JSON.parse(localStorage.getItem(OLD_KEY) || "{}");
    if (v1.apiKey) {
      return { keys: { anthropic: v1.apiKey }, provider: "anthropic", model: v1.model, messages: v1.messages };
    }
  } catch {
    /* ignore */
  }
  return {};
}
const saved = load();
const initialProvider = saved.provider && getProvider(saved.provider).id === saved.provider ? saved.provider : PROVIDERS[0].id;
const initialModel =
  saved.model && getProvider(initialProvider).models.some((m) => m.id === saved.model)
    ? saved.model
    : getProvider(initialProvider).models[0].id;

interface ChatState {
  keys: Record<string, string>;
  provider: string;
  model: string;
  messages: ChatMsg[];
  steps: AgentStep[];
  status: "idle" | "running";
  error: string | null;
  controller: AbortController | null;
  keyManagerOpen: boolean;
  sessionTokens: number;
  canWrite: boolean;
  setCanWrite: (v: boolean) => void;
  proposals: Proposal[];
  applyProposal: (id: string) => void;
  rejectProposal: (id: string) => void;
  setKey: (providerId: string, key: string) => void;
  setProvider: (id: string) => void;
  setModel: (m: string) => void;
  setKeyManagerOpen: (open: boolean) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

function persist(s: ChatState) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ keys: s.keys, provider: s.provider, model: s.model, messages: s.messages, canWrite: s.canWrite }),
    );
  } catch {
    /* ignore */
  }
}

export const useChat = create<ChatState>((set, get) => ({
  keys: saved.keys ?? {},
  provider: initialProvider,
  model: initialModel,
  messages: saved.messages ?? [],
  steps: [],
  status: "idle",
  error: null,
  controller: null,
  keyManagerOpen: false,
  sessionTokens: 0,
  canWrite: saved.canWrite ?? false,
  proposals: [],

  setCanWrite: (v) => {
    set({ canWrite: v });
    persist(get());
  },
  applyProposal: (id) => {
    const p = get().proposals.find((x) => x.id === id);
    if (!p) return;
    const v = useVault.getState();
    if (p.kind === "create") v.createNoteWith(p.title, p.content, p.folder || "");
    else if (p.targetId) v.updateContent(p.targetId, p.content);
    set((s) => ({ proposals: s.proposals.filter((x) => x.id !== id) }));
    v.toast(p.kind === "create" ? `Created “${p.title}”` : `Updated “${p.title}”`);
  },
  rejectProposal: (id) => set((s) => ({ proposals: s.proposals.filter((x) => x.id !== id) })),

  setKey: (providerId, key) => {
    set((s) => ({ keys: { ...s.keys, [providerId]: key }, error: null }));
    persist(get());
  },
  setProvider: (id) => {
    const p = getProvider(id);
    set((s) => ({
      provider: p.id,
      model: p.models.some((m) => m.id === s.model) ? s.model : p.models[0].id,
      error: null,
    }));
    persist(get());
  },
  setModel: (m) => {
    set({ model: m });
    persist(get());
  },
  setKeyManagerOpen: (open) => set({ keyManagerOpen: open }),

  send: async (text) => {
    const t = text.trim();
    if (!t || get().status === "running") return;
    const provider = getProvider(get().provider);
    const apiKey = (get().keys[provider.id] || "").trim();
    if (!apiKey) {
      set({ error: `Add a ${provider.label} API key to start.`, keyManagerOpen: true });
      return;
    }

    const messages: ChatMsg[] = [...get().messages, { role: "user", content: t }];
    const controller = new AbortController();
    set({ messages, status: "running", steps: [], error: null, controller });

    const st = useVault.getState();
    const canWrite = get().canWrite;
    const vault: VaultAccess = {
      notes: st.notes,
      resolve: (title) => st.resolve(title),
      getNote: (id) => st.notesById.get(id),
      linksOf: (id) => st.linksOf(id),
      backlinksOf: (id) => st.backlinksOf(id),
      propose: canWrite
        ? (p) => {
            const id = `p-${Date.now().toString(36)}-${Math.round(performance.now())}`;
            set((s) => ({ proposals: [...s.proposals, { ...p, id }] }));
            return `Proposed to ${p.kind} "${p.title}". It is queued for the user to approve — do not assume it is saved.`;
          }
        : undefined,
    };

    const startedAt = performance.now();
    try {
      const result = await runVaultAgent({
        provider,
        apiKey,
        canWrite,
        model: get().model,
        messages,
        vault,
        onStep: (s) => set((p) => ({ steps: [...p.steps, s] })),
        signal: controller.signal,
      });
      set((p) => ({
        messages: [
          ...p.messages,
          {
            role: "assistant",
            content: result.text,
            meta: { ms: Math.round(performance.now() - startedAt), tokens: result.tokens },
          },
        ],
        sessionTokens: p.sessionTokens + result.tokens,
        status: "idle",
        controller: null,
      }));
      persist(get());
    } catch (e) {
      if (controller.signal.aborted) {
        set({ status: "idle", controller: null });
        return;
      }
      set({ error: e instanceof Error ? e.message : String(e), status: "idle", controller: null });
    }
  },

  stop: () => {
    get().controller?.abort();
    set({ status: "idle", controller: null });
  },

  clear: () => {
    get().controller?.abort();
    set({ messages: [], steps: [], error: null, status: "idle", controller: null, sessionTokens: 0, proposals: [] });
    persist(get());
  },
}));
