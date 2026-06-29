import { create } from "zustand";
import { useVault } from "../store/useVault";
import { runVaultAgent, type ChatMsg, type AgentStep, type VaultAccess } from "./agent";
import { PROVIDERS, getProvider } from "./providers";

const KEY = "inkwell.ai.v2";
const OLD_KEY = "inkwell.ai.v1";

interface Persisted {
  keys?: Record<string, string>;
  provider?: string;
  model?: string;
  messages?: ChatMsg[];
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
    localStorage.setItem(KEY, JSON.stringify({ keys: s.keys, provider: s.provider, model: s.model, messages: s.messages }));
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
    const vault: VaultAccess = {
      notes: st.notes,
      resolve: (title) => st.resolve(title),
      getNote: (id) => st.notesById.get(id),
      linksOf: (id) => st.linksOf(id),
      backlinksOf: (id) => st.backlinksOf(id),
    };

    try {
      const answer = await runVaultAgent({
        provider,
        apiKey,
        model: get().model,
        messages,
        vault,
        onStep: (s) => set((p) => ({ steps: [...p.steps, s] })),
        signal: controller.signal,
      });
      set((p) => ({
        messages: [...p.messages, { role: "assistant", content: answer }],
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
    set({ messages: [], steps: [], error: null, status: "idle", controller: null });
    persist(get());
  },
}));
