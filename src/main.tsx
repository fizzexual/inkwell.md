import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { startDiskSync, autoloadVault, startVaultWatch } from "./vault/sync";
import { autoConnectRemote } from "./vault/remote";
import { startHistory } from "./useHistory";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "katex/dist/katex.min.css";
import "./styles/global.css";

// on-disk vaults (desktop only; all no-op in the browser)
startDiskSync();
startVaultWatch();
autoloadVault();
// reconnect to a saved self-hosted sync server, if any (phone/desktop shared vault)
autoConnectRemote();
// per-note version history (auto-snapshots as you edit)
startHistory();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
