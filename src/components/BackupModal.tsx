import { useEffect, useState } from "react";
import { useVault } from "../store/useVault";
import { listBackups, type BackupInfo } from "../vault/disk";
import { openRestoredFlow, restoreBackupFlow } from "../vault/backup";
import { listenEscape } from "../keys";
import { X as CloseX } from "lucide-react";
import "./BackupModal.css";

function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** "Restore a backup…": the open vault's backups; restoring makes a new folder next to the vault. */
export default function BackupModal({ onClose }: { onClose: () => void }) {
  const toast = useVault((s) => s.toast);
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);

  useEffect(() => listenEscape(onClose), [onClose]);
  useEffect(() => {
    listBackups()
      .then(setList)
      .catch((e) => setError(errText(e)));
  }, []);

  const restore = async (name: string) => {
    setBusy(name);
    try {
      setRestored(await restoreBackupFlow(name));
    } catch (e) {
      toast(`Restore failed: ${errText(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const reveal = async (path: string) => {
    try {
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(path);
    } catch (e) {
      toast(`Couldn't open Explorer: ${errText(e)}`);
    }
  };

  return (
    <div className="bk-backdrop" onMouseDown={onClose}>
      <div className="bk" role="dialog" aria-label="Restore a backup" onMouseDown={(e) => e.stopPropagation()}>
        <header className="bk-head">
          <h2>{restored ? "Backup restored" : "Restore a backup"}</h2>
          <button className="ghost-btn" aria-label="Close" onClick={onClose}>
            <CloseX size={15} />
          </button>
        </header>
        {restored ? (
          <>
            <div className="bk-msg">
              The notes are in a new folder next to your vault — nothing in your vault was changed:
              <code className="bk-path">{restored}</code>
            </div>
            <div className="bk-actions">
              <button
                className="bk-btn primary"
                onClick={() => {
                  onClose();
                  void openRestoredFlow();
                }}
              >
                Open it as the vault
              </button>
              <button className="bk-btn" onClick={() => void reveal(restored)}>
                Show in Explorer
              </button>
            </div>
          </>
        ) : (
          <div className="bk-body">
            {error ? (
              <div className="bk-msg">Couldn't list the backups: {error}</div>
            ) : !list ? (
              <div className="bk-msg">Loading…</div>
            ) : !list.length ? (
              <div className="bk-msg">No backups of this vault yet. Use “Back up now” in the vault menu.</div>
            ) : (
              list.map((b) => (
                <div className="bk-row" key={b.name} title={b.name}>
                  <span className="bk-when">{new Date(b.time).toLocaleString()}</span>
                  <span className="bk-meta">
                    {b.notes} note{b.notes === 1 ? "" : "s"} · {sizeText(b.size)}
                  </span>
                  <button className="bk-btn" onClick={() => void restore(b.name)}>
                    {busy === b.name ? "Restoring…" : "Restore"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
