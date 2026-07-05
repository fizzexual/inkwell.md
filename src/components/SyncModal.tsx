import { useEffect, useState } from "react";
import { useVault } from "../store/useVault";
import { connectRemote, disconnectRemote } from "../vault/remote";
import { MonitorSmartphone, Server, RefreshCw, Copy, Check } from "lucide-react";
import "./SyncModal.css";

const STATUS_LABEL: Record<string, string> = {
  off: "Not connected",
  connecting: "Connecting…",
  online: "Connected — syncing live",
  error: "Couldn't reach the server",
};

export default function SyncModal() {
  const open = useVault((s) => s.syncOpen);
  const setOpen = useVault((s) => s.setSyncOpen);
  const status = useVault((s) => s.remoteStatus);
  const savedUrl = useVault((s) => s.remoteUrl);
  const savedToken = useVault((s) => s.remoteToken);

  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(savedUrl || "");
    setToken(savedToken || "");
    setErr(null);
    // if this page is itself served by a sync server (e.g. opened on the phone from the server URL),
    // pre-fill the address so the user only has to enter the token
    if (!savedUrl && typeof location !== "undefined" && /^https?:/.test(location.origin)) {
      fetch(`${location.origin}/api/health`)
        .then((r) => (r.ok ? r.json() : null))
        .then((h) => {
          if (h?.ok) setUrl((u) => u || location.origin);
        })
        .catch(() => {
          /* not a sync server — leave it blank */
        });
    }
  }, [open, savedUrl, savedToken]);

  if (!open) return null;

  const online = status === "online";

  const connect = async () => {
    const u = url.trim();
    const t = token.trim();
    if (!u || !t) {
      setErr("Enter the server address and token.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await connectRemote(u.startsWith("http") ? u : `http://${u}`, t);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(savedUrl || url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="sync-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="sync" onMouseDown={(e) => e.stopPropagation()}>
        <header className="sync-head">
          <MonitorSmartphone size={17} />
          <h2>Device sync</h2>
          <button className="sync-x" aria-label="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </header>

        <div className={"sync-status " + status}>
          <span className="sync-dot" />
          <span>{STATUS_LABEL[status] || status}</span>
          {online && savedUrl && <span className="sync-url">{savedUrl}</span>}
        </div>

        {online ? (
          <div className="sync-body">
            <p className="sync-note">
              This device is sharing one vault with the server. Edits here and on your other devices sync live.
            </p>
            <div className="sync-share">
              <label>Open this on your phone</label>
              <div className="sync-share-row">
                <code>{savedUrl}</code>
                <button className="sync-copy" onClick={copyUrl} title="Copy address">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <span className="sync-hint">
                On the same Wi-Fi, or from anywhere over Tailscale — open the address, enter the same token.
              </span>
            </div>
            <button className="sync-disconnect" onClick={() => disconnectRemote(true)}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="sync-body">
            <p className="sync-note">
              Run <code>npm run sync</code> on the computer that holds your vault, then enter the address and token it
              prints. Your phone connects to the same server and shares the vault live — no cloud, no login.
            </p>
            <label className="sync-label">
              <Server size={13} /> Server address
            </label>
            <input
              className="sync-input"
              value={url}
              placeholder="http://192.168.1.20:8787  (or your Tailscale address)"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()}
            />
            <label className="sync-label">Token</label>
            <input
              className="sync-input"
              value={token}
              placeholder="the token the server printed on startup"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()}
            />
            {err && <div className="sync-err">{err}</div>}
            <div className="sync-warn">
              Connecting replaces this device's current view with the server's vault.
            </div>
            <button className="sync-connect" onClick={connect} disabled={busy}>
              {busy ? <RefreshCw size={14} className="sync-spin" /> : <Server size={14} />}
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
