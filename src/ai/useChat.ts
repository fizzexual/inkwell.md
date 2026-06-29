import { create } from "zustand";
import { useVault } from "../store/useVault";
import { runVaultAgent, type ChatMsg, type AgentStep, type VaultAccess } from "./agent";

const KEY = "inkwell.ai.v1";

interface Persisted {
  apiKey?: string;
  model?: string;
  messages?: ChatMsg[];
}

const load = (): Persisted => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};
const saved = load();

interface ChatState {
  apiKey: string;
  model: string;
  messages: ChatMsg[];
  steps: AgentStep[];
  status: "idle" | "running";
  error: string | null;
  controller: AbortController | null;
  setApiKey: (k: string) => void;
  setModel: (m: string) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

function persist(s: ChatState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ apiKey: s.apiKey, model: s.model, messages: s.messages }));
  } catch {
    /* ignore */
  }
}

export const useChat = create<ChatState>((set, get) => ({
  apiKey: saved.apiKey ?? "",
  model: saved.model ?? "claude-sonnet-4-6",
  messages: saved.messages ?? [],
  steps: [],
  status: "idle",
  error: null,
  controller: null,

  setApiKey: (k) => {
    set({ apiKey: k, error: null });
    persist(get());
  },
  setModel: (m) => {
    set({ model: m });
    persist(get());
  },

  send: async (text) => {
    const t = text.trim();
    if (!t || get().status === "running") return;
    const apiKey = get().apiKey.trim();
    if (!apiKey) {
      set({ error: "Add your Anthropic API key below to start chatting." });
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
