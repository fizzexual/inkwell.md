// The offline chat model on disk: is it there, download it (with progress), cancel, delete.
// The download itself runs in Rust (src-tauri/src/offline_model.rs); this store mirrors its state
// for the UI and decides whether the "Inkwell offline" provider can be used.
import { create } from "zustand";
import chatModel from "../../ml/chat-model.json";
import { isTauri } from "../../vault/disk";

export type OfflineStatus = "unknown" | "unsupported" | "absent" | "partial" | "downloading" | "ready";

interface RustStatus {
  installed: boolean;
  downloading: boolean;
  bytes_on_disk: number;
  total_bytes: number;
}

interface OfflineModelState {
  status: OfflineStatus;
  /** bytes downloaded so far (during a download) */
  received: number;
  total: number;
  /** bytes the model folder takes now, partial files included */
  onDisk: number;
  error: string | null;
  refresh: () => Promise<void>;
  download: () => Promise<void>;
  cancel: () => Promise<void>;
  /** delete the model files; resolves with the bytes freed */
  remove: () => Promise<number>;
}

const TOTAL = chatModel.files.reduce((n, f) => n + f.size, 0);

/** The download size shown on the button, in MB. */
export const downloadSizeMb = () => Math.round(TOTAL / 1e6);

async function call<T>(cmd: string): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd);
}

const fromRust = (s: RustStatus): Partial<OfflineModelState> => ({
  status: s.downloading ? "downloading" : s.installed ? "ready" : s.bytes_on_disk > 0 ? "partial" : "absent",
  onDisk: s.bytes_on_disk,
  total: s.total_bytes,
});

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useOfflineModel = create<OfflineModelState>((set, get) => ({
  status: "unknown",
  received: 0,
  total: TOTAL,
  onDisk: 0,
  error: null,

  refresh: async () => {
    if (!isTauri()) {
      set({ status: "unsupported" });
      return;
    }
    try {
      set(fromRust(await call<RustStatus>("offline_model_status")));
    } catch (e) {
      set({ error: message(e) });
    }
  },

  download: async () => {
    if (!isTauri() || get().status === "downloading") return;
    set({ status: "downloading", error: null, received: 0 });
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<{ received: number; total: number }>("offline-model-progress", (e) =>
      set({ received: e.payload.received, total: e.payload.total }),
    );
    try {
      const s = await call<RustStatus>("offline_model_download");
      set({ ...fromRust(s), received: s.total_bytes });
    } catch (e) {
      set({ error: message(e) });
      await get().refresh();
      if (get().status === "downloading") set({ status: "partial" });
    } finally {
      unlisten();
    }
  },

  cancel: async () => {
    if (!isTauri()) return;
    await call("offline_model_cancel");
  },

  remove: async () => {
    if (!isTauri()) return 0;
    const freed = await call<number>("offline_model_delete");
    set({ status: "absent", onDisk: 0, received: 0, error: null });
    return freed;
  },
}));

/** Why the offline provider can't answer right now, or null when it can. */
export function offlineUnavailableReason(s: Pick<OfflineModelState, "status">): string | null {
  switch (s.status) {
    case "ready":
      return null;
    case "unsupported":
      return "The offline model needs the Inkwell desktop app.";
    case "downloading":
      return "The offline model is still downloading.";
    default:
      return `Download the offline chat model first (about ${downloadSizeMb()} MB, once) in AI providers → Inkwell offline.`;
  }
}
