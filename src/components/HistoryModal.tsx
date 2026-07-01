import { useState } from "react";
import { useVault } from "../store/useVault";
import { useHistory } from "../useHistory";
import { History, RotateCcw, Camera } from "lucide-react";
import "./HistoryModal.css";

function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const strip = (md: string) =>
  md
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/[#>*`_[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export default function HistoryModal() {
  const open = useVault((s) => s.historyOpen);
  const setOpen = useVault((s) => s.setHistoryOpen);
  const selectedId = useVault((s) => s.selectedId);
  const note = useVault((s) => s.notesById.get(s.selectedId));
  const updateContent = useVault((s) => s.updateContent);
  const toast = useVault((s) => s.toast);
  // NB: apply the ?? [] fallback OUTSIDE the selector — returning a fresh [] inside loops forever
  const versions = useHistory((s) => s.versions[selectedId]) ?? [];
  const record = useHistory((s) => s.record);
  const [sel, setSel] = useState(0);

  if (!open) return null;

  const snapshot = () => {
    if (!note) return;
    record(selectedId, note.content ?? "", Date.now());
    toast("Version saved");
  };
  const restore = (content: string) => {
    if (note) record(selectedId, note.content ?? "", Date.now()); // checkpoint current first
    updateContent(selectedId, content);
    toast("Restored earlier version");
    setOpen(false);
  };

  const current = versions[sel];

  return (
    <div className="hist-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="hist" onMouseDown={(e) => e.stopPropagation()}>
        <header className="hist-head">
          <History size={16} />
          <h2>Version history</h2>
          <span className="hist-note">{note?.title}</span>
          <button className="hist-snap" onClick={snapshot} title="Save a version now">
            <Camera size={13} /> Save version
          </button>
          <button className="hist-x" onClick={() => setOpen(false)}>
            ✕
          </button>
        </header>

        {versions.length === 0 ? (
          <div className="hist-empty">
            No saved versions yet. Inkwell snapshots this note as you edit, or click <b>Save version</b> to
            checkpoint it now.
          </div>
        ) : (
          <div className="hist-body">
            <ul className="hist-list">
              {versions.map((v, i) => (
                <li key={v.t}>
                  <button className={"hist-item" + (i === sel ? " active" : "")} onClick={() => setSel(i)}>
                    <span className="hist-time">{ago(v.t)}</span>
                    <span className="hist-snippet">{strip(v.content).slice(0, 60) || "empty"}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="hist-preview">
              <div className="hist-preview-bar">
                <span>{current ? new Date(current.t).toLocaleString() : ""}</span>
                <button className="hist-restore" onClick={() => current && restore(current.content)}>
                  <RotateCcw size={13} /> Restore this version
                </button>
              </div>
              <pre className="hist-content">{current?.content}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
