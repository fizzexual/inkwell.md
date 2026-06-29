import { useEffect } from "react";
import { useVault } from "../store/useVault";
import { Keyboard } from "../icons";
import "./ShortcutsModal.css";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Navigation",
    items: [
      ["Ctrl / Cmd + P", "Command palette"],
      ["Ctrl / Cmd + K", "Command palette"],
      ["Alt + ← / →", "Back / forward"],
      ["Ctrl / Cmd + G", "Knowledge map"],
    ],
  },
  {
    title: "Notes",
    items: [
      ["Ctrl / Cmd + N", "New note"],
      ["Ctrl / Cmd + E", "Toggle edit / read"],
      ["Ctrl / Cmd + Z", "Undo"],
      ["Ctrl / Cmd + Y", "Redo"],
      ["Esc", "Leave edit, then return to map"],
    ],
  },
  {
    title: "Editor",
    items: [
      ["[[", "Link to a note"],
      ["![[", "Embed a note"],
      ["/", "Slash commands"],
      ["$ … $ · $$ … $$", "Inline / block math"],
    ],
  },
  {
    title: "Layout",
    items: [
      ["Ctrl / Cmd + \\", "Toggle sidebar"],
      ["Ctrl / Cmd + Shift + \\", "Toggle inspector"],
      ["Ctrl / Cmd + J", "Toggle AI assistant"],
      ["?", "This help"],
    ],
  },
];

export default function ShortcutsModal() {
  const open = useVault((s) => s.shortcutsOpen);
  const setOpen = useVault((s) => s.setShortcutsOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="sc-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="sc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sc-head">
          <Keyboard size={17} />
          <h2>Keyboard shortcuts</h2>
          <button className="sc-close" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="sc-grid">
          {GROUPS.map((g) => (
            <div className="sc-group" key={g.title}>
              <div className="sc-group-title">{g.title}</div>
              {g.items.map(([keys, label]) => (
                <div className="sc-row" key={label}>
                  <span className="sc-label">{label}</span>
                  <kbd className="sc-keys">{keys}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
