// Auto-update flow: check → banner → (user clicks) save notes → download with progress → relaunch.
// Nothing is ever downloaded or installed without the click on the banner.
import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
import { present, progressText, toOutcome, type Trigger } from "./logic";

type Phase = "idle" | "checking" | "available" | "downloading" | "installing";

interface UpdaterState {
  phase: Phase;
  /** the line the banner shows */
  text: string;
  version: string;
  checkForUpdates: (trigger: Trigger) => Promise<void>;
  install: () => Promise<void>;
  /** "Later": hide the banner (a manual check brings it back) */
  dismiss: () => void;
}

// the plugin's Update handle is not serialisable state — keep it beside the store
let pending: Update | null = null;

const busy = (p: Phase) => p === "checking" || p === "downloading" || p === "installing";

export const useUpdater = create<UpdaterState>((set, get) => ({
  phase: "idle",
  text: "",
  version: "",

  checkForUpdates: async (trigger) => {
    const before = get().phase;
    if (busy(before)) return;
    set({ phase: "checking" });
    const { check } = await import("@tauri-apps/plugin-updater");
    let found: Update | null = null;
    const outcome = await toOutcome(async () => (found = await check()));
    const view = present(outcome, trigger);
    if (view.show === "banner" && found) {
      pending = found;
      set({ phase: "available", text: view.text, version: view.version });
      return;
    }
    // nothing new: an already-found update (banner hidden with "Later") stays installable
    set({ phase: before === "available" && pending ? "available" : "idle" });
    if (view.show === "toast") {
      const { useVault } = await import("../store/useVault");
      useVault.getState().toast(view.text);
    }
  },

  install: async () => {
    const update = pending;
    if (!update || get().phase !== "available") return;
    set({ phase: "downloading", text: progressText(0) });
    try {
      // the installer closes the app: the last debounced note edits must reach disk first
      const { flushDiskSync } = await import("../vault/sync");
      await flushDiskSync();
      let total: number | undefined;
      let done = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") {
          total = e.data.contentLength;
          set({ text: progressText(0, total) });
        } else if (e.event === "Progress") {
          done += e.data.chunkLength;
          set({ text: progressText(done, total) });
        } else {
          set({ phase: "installing", text: "Installing…" });
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      console.error("Inkwell: update failed", e);
      set({ phase: "available", text: "Update failed — try again" });
    }
  },

  dismiss: () => {
    if (get().phase === "available") set({ phase: "idle" });
  },
}));
