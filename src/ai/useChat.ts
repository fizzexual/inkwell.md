import { create } from "zustand";
import { useVault } from "../store/useVault";
import { runVaultAgent, type ChatMsg, type AgentStep, type VaultAccess, type Proposal } from "./agent";
import { PROVIDERS, getProvider, fetchModels } from "./providers";
import { semanticSearch, isIndexWarm } from "../search/semantic";
import { isTauri } from "../vault/disk";
import { secretsGet, secretSet, secretDelete, migrateKeys } from "./keyStore";
import { offlineUnavailableReason, useOfflineModel } from "./offline/model";
import { sendOffline } from "./offline/send";

const stripMd = (md: string) =>
  md
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/[#>*`_[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
// Desktop app: keys live in the OS keychain and only in memory here. The browser build has no
// keychain, so there they stay in localStorage as before.
const desktop = isTauri();
// plaintext keys still waiting to move into the keychain (kept in localStorage until they have)
const unmigrated: Record<string, string> = desktop ? { ...(saved.keys ?? {}) } : {};
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
  /** the answer so far while the offline model streams it ("" otherwise) */
  streaming: string;
  error: string | null;
  controller: AbortController | null;
  keyManagerOpen: boolean;
  sessionTokens: number;
  canWrite: boolean;
  setCanWrite: (v: boolean) => void;
  proposals: Proposal[];
  applyProposal: (id: string) => void;
  rejectProposal: (id: string) => void;
  /** live model lists fetched from each provider's /models endpoint (cache, not persisted). */
  fetchedModels: Record<string, { id: string; label: string }[]>;
  modelsLoading: Record<string, boolean>;
  modelsError: Record<string, string>;
  loadModels: (providerId: string, force?: boolean) => Promise<void>;
  setKey: (providerId: string, key: string) => void;
  setProvider: (id: string) => void;
  setModel: (m: string) => void;
  setKeyManagerOpen: (open: boolean) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

// debounce handle for live model fetching triggered by key edits
let keyFetchTimer: ReturnType<typeof setTimeout> | undefined;
// keychain writes run one after another, so the last key typed is the one that stays saved
let keyWrites: Promise<void> = Promise.resolve();

function persist(s: ChatState) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        keys: desktop ? (Object.keys(unmigrated).length ? unmigrated : undefined) : s.keys,
        provider: s.provider,
        model: s.model,
        // cap the stored transcript so a long chat never blows the localStorage quota
        messages: s.messages.slice(-60),
        canWrite: s.canWrite,
      }),
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
  streaming: "",
  error: null,
  controller: null,
  keyManagerOpen: false,
  sessionTokens: 0,
  canWrite: saved.canWrite ?? false,
  proposals: [],
  fetchedModels: {},
  modelsLoading: {},
  modelsError: {},

  loadModels: async (providerId, force) => {
    const provider = getProvider(providerId);
    if (provider.kind === "offline") return; // one fixed on-device model, nothing to list
    const key = (get().keys[providerId] || "").trim();
    if (!key && !provider.keyless) return; // need a key (or local) to list models
    if (!force && get().fetchedModels[providerId]) return; // cached
    if (get().modelsLoading[providerId]) return;
    set((s) => ({ modelsLoading: { ...s.modelsLoading, [providerId]: true }, modelsError: { ...s.modelsError, [providerId]: "" } }));
    try {
      const list = await fetchModels(provider, key);
      set((s) => ({
        fetchedModels: { ...s.fetchedModels, [providerId]: list },
        modelsLoading: { ...s.modelsLoading, [providerId]: false },
      }));
    } catch (e) {
      set((s) => ({
        modelsLoading: { ...s.modelsLoading, [providerId]: false },
        modelsError: { ...s.modelsError, [providerId]: e instanceof Error ? e.message : "failed" },
      }));
    }
  },

  setCanWrite: (v) => {
    set({ canWrite: v });
    persist(get());
  },
  applyProposal: (id) => {
    const p = get().proposals.find((x) => x.id === id);
    if (!p) return;
    const v = useVault.getState();
    set((s) => ({ proposals: s.proposals.filter((x) => x.id !== id) }));
    if (p.kind === "create") {
      v.createNoteWith(p.title, p.content, p.folder || "");
      v.toast(`Created “${p.title}”`);
    } else if (p.targetId && v.notesById.get(p.targetId)) {
      v.updateContent(p.targetId, p.content);
      v.toast(`Updated “${p.title}”`);
    } else {
      v.toast(`“${p.title}” no longer exists — skipped`);
    }
  },
  rejectProposal: (id) => set((s) => ({ proposals: s.proposals.filter((x) => x.id !== id) })),

  setKey: (providerId, key) => {
    set((s) => ({ keys: { ...s.keys, [providerId]: key }, error: null }));
    if (desktop) {
      delete unmigrated[providerId]; // the keychain copy replaces any plaintext one
      const id = providerId;
      keyWrites = keyWrites
        .then(() => (key.trim() ? secretSet(id, key) : secretDelete(id)))
        .catch((e) =>
          set({
            error: `Couldn't save the ${getProvider(id).label} key to Windows Credential Manager: ${e instanceof Error ? e.message : String(e)}`,
          }),
        );
    }
    persist(get());
    // debounce the live model fetch so typing/pasting a key doesn't hammer the /models endpoint
    if (keyFetchTimer) clearTimeout(keyFetchTimer);
    if (key.trim()) keyFetchTimer = setTimeout(() => get().loadModels(providerId, true), 700);
  },
  setProvider: (id) => {
    const p = getProvider(id);
    set((s) => ({
      provider: p.id,
      model: p.models.some((m) => m.id === s.model) ? s.model : p.models[0].id,
      error: null,
    }));
    persist(get());
    get().loadModels(id); // pull the live list for this provider
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
    if (!apiKey && !provider.keyless) {
      set({ error: `Add a ${provider.label} API key to start.`, keyManagerOpen: true });
      return;
    }

    // the on-device model: single-shot RAG over local search, streamed, no tools and no network
    if (provider.kind === "offline") {
      if (useOfflineModel.getState().status === "unknown") await useOfflineModel.getState().refresh();
      const why = offlineUnavailableReason(useOfflineModel.getState());
      if (why) {
        set({ error: why, keyManagerOpen: true });
        return;
      }
      const history = get().messages;
      const controller = new AbortController();
      set({ messages: [...history, { role: "user", content: t }], status: "running", steps: [], error: null, controller, streaming: "" });
      const startedAt = performance.now();
      // after Stop (or a newer question) this run no longer owns the chat
      const mine = () => get().controller === controller;
      try {
        const out = await sendOffline(t, history, (tok) => mine() && set((s) => ({ streaming: s.streaming + tok })), controller.signal);
        const content = out.aborted ? (out.text ? `${out.text} …(stopped)` : "") : out.text;
        set((p) => ({
          messages:
            content && (mine() || !p.controller)
              ? [...p.messages, { role: "assistant", content, meta: { ms: Math.round(performance.now() - startedAt), tokens: out.tokens } }]
              : p.messages,
          sessionTokens: p.sessionTokens + out.tokens,
          ...(mine() ? { status: "idle", controller: null, streaming: "" } : {}),
        }));
        persist(get());
      } catch (e) {
        if (mine()) set({ error: e instanceof Error ? e.message : String(e), status: "idle", controller: null, streaming: "" });
      }
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

    // local RAG: if the on-device embedding index is already warm, retrieve the notes most relevant
    // to the question by MEANING and hand them to the agent (no model download / added latency here)
    if (isIndexWarm()) {
      try {
        const hits = await semanticSearch(t, st.notes, 6);
        vault.semanticHits = hits
          .map((h) => {
            const n = st.notesById.get(h.id);
            return n
              ? { id: n.id, title: n.title, folder: n.folder ?? "", snippet: stripMd(n.content ?? "").slice(0, 160) }
              : null;
          })
          .filter((x): x is NonNullable<typeof x> => !!x);
      } catch {
        /* semantic retrieval failed — the agent still has keyword search + the map */
      }
    }

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
    // drop any write proposals queued by the run the user just cancelled
    set({ status: "idle", controller: null, proposals: [], streaming: "" });
  },

  clear: () => {
    get().controller?.abort();
    set({ messages: [], steps: [], error: null, status: "idle", controller: null, sessionTokens: 0, proposals: [], streaming: "" });
    persist(get());
  },
}));

/** Desktop start-up: move plaintext keys into the keychain, then load every saved key into memory. */
async function loadDesktopKeys(): Promise<void> {
  for (const p of await migrateKeys(unmigrated)) delete unmigrated[p];
  let stored: Record<string, string> = {};
  try {
    stored = await secretsGet(PROVIDERS.filter((p) => !p.keyless).map((p) => p.id));
  } catch (e) {
    console.error("Inkwell: couldn't read AI keys from the keychain", e);
  }
  // a key edited while this ran wins over the stored copy
  useChat.setState((s) => ({ keys: { ...stored, ...s.keys } }));
  persist(useChat.getState());
  try {
    localStorage.removeItem(OLD_KEY); // v2 now holds everything v1 had, minus the key
  } catch {
    /* ignore */
  }
}

/** Resolves once the desktop app has loaded its keys from the keychain (at once in the browser). */
export const keysReady: Promise<void> = desktop ? loadDesktopKeys() : Promise.resolve();
keyWrites = keysReady;
