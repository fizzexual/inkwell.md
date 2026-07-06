import { useEffect, useState } from "react";
import { useVault } from "../store/useVault";
import { connectRemote, disconnectRemote } from "../vault/remote";
import { isTauri, startSync, stopSync, syncStatus, pickFolder, type SyncInfo } from "../vault/disk";
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

  const vaultPath = useVault((s) => s.vaultPath);
  const tauri = isTauri();

  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // host mode (desktop app sharing its own vault)
  const [host, setHost] = useState<SyncInfo | null>(null);
  const [hostBusy, setHostBusy] = useState(false);
  const [hostErr, setHostErr] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (open && tauri) syncStatus().then(setHost).catch(() => {});
  }, [open, tauri]);

  const copyText = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
    });
  };

  const startSharing = async () => {
    setHostBusy(true);
    setHostErr(null);
    try {
      const folder = vaultPath || (await pickFolder());
      if (!folder) return;
      setHost(await startSync(folder));
    } catch (e) {
      setHostErr(e instanceof Error ? e.message : "Couldn't start sharing");
    } finally {
      setHostBusy(false);
    }
  };
  const stopSharing = async () => {
    await stopSync().catch(() => {});
    setHost({ running: false, port: 0, token: "", urls: [] });
  };

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

        {tauri ? (
          <div className="sync-body">
            {host?.running ? (
              <>
                <p className="sync-note">
                  Sharing this vault. On your phone, open Inkwell and enter one of these addresses + the token. Everything
                  stays on your network.
                </p>
                <label className="sync-label">Address</label>
                {host.urls.length ? (
                  host.urls.map((u) => (
                    <div className="sync-share-row" key={u}>
                      <code>{u}</code>
                      <button className="sync-copy" onClick={() => copyText(u, u)} title="Copy">
                        {copiedKey === u ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="sync-hint">Sharing on port {host.port} — connect using this PC's network address.</div>
                )}
                <label className="sync-label">Token</label>
                <div className="sync-share-row">
                  <code>{host.token}</code>
                  <button className="sync-copy" onClick={() => copyText(host.token, "token")} title="Copy">
                    {copiedKey === "token" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <button className="sync-disconnect" onClick={stopSharing}>
                  Stop sharing
                </button>
              </>
            ) : (
              <>
                <p className="sync-note">
                  Share this vault with your phone and other devices over your own network — no cloud, no login, nothing
                  leaves your machine. The installer already opened the firewall, so this just works.
                </p>
                {hostErr && <div className="sync-err">{hostErr}</div>}
                <button className="sync-connect" onClick={startSharing} disabled={hostBusy}>
                  {hostBusy ? <RefreshCw size={14} className="sync-spin" /> : <Server size={14} />}
                  {hostBusy ? "Starting…" : "Start sharing this vault"}
                </button>
              </>
            )}
          </div>
        ) : online ? (
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
              On your desktop, open Inkwell → <b>Device sync</b> → <b>Start sharing</b>. Enter the address and token it
              shows here. Your phone then shares that vault live — no cloud, no login.
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
