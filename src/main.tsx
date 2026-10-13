import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { startDiskSync, autoloadVault, startVaultWatch } from "./vault/sync";
import { startAutoBackup } from "./vault/backup";
import { startGitHistory } from "./vault/gitHistory";
import { isTauri } from "./vault/disk";
import { useVault } from "./store/useVault";
import { startHistory } from "./useHistory";
import { installLinkGuard } from "./links";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "katex/dist/katex.min.css";
import "./styles/global.css";

// clean up any service worker left over from the old PWA build — Inkwell is a desktop app now
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((rs) => rs.forEach((r) => r.unregister()))
    .catch(() => {});
}

// links in notes never navigate the app window: web links open in the system browser, anything
// else (javascript:, file:, relative paths) is ignored
installLinkGuard(document, (url) => {
  if (isTauri()) {
    import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url)).catch(() => {});
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
});

// on-disk vaults (desktop only; all no-op in the browser)
startDiskSync();
startVaultWatch();
startAutoBackup(); // a zip of the vault when it opens and the last one is a day old
startGitHistory(); // opt-in per vault: commits to a git repo in the vault folder, 2 min after the last change
autoloadVault();
// per-note version history (auto-snapshots as you edit)
startHistory();

// desktop only: the system-wide hotkey (Cmd/Ctrl+Shift+Space) fires this to open Quick Capture
if (isTauri()) {
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen("global-quick-capture", () => useVault.getState().setQuickOpen(true)))
    // dev only: drop the listener when this module is hot-replaced, so captures don't stack up
    .then((unlisten) => import.meta.hot?.dispose(unlisten))
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
