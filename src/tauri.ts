// Thin wrapper so the UI also runs in a plain browser (vite preview) where the
// Tauri API is absent — the calls simply no-op there.
type WinAction = "minimize" | "maximize" | "close";

export async function windowControl(action: WinAction): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (action === "minimize") await win.minimize();
    else if (action === "maximize") await win.toggleMaximize();
    else await win.close();
  } catch {
    /* not running inside Tauri — ignore */
  }
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
