import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { startDiskSync, autoloadVault, startVaultWatch } from "./vault/sync";
import { startHistory } from "./useHistory";
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

// on-disk vaults (desktop only; all no-op in the browser)
startDiskSync();
startVaultWatch();
autoloadVault();
// per-note version history (auto-snapshots as you edit)
startHistory();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
