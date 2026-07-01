import { useEffect, useState } from "react";
import { useVault } from "../store/useVault";
import { FOLDER_PALETTE } from "../folders";
import { NOTE_ICONS, NOTE_ICON_NAMES } from "../noteIcons";
import "./Picker.css";

export default function Picker() {
  const picker = useVault((s) => s.picker);
  const close = useVault((s) => s.closePicker);
  const setNoteIcon = useVault((s) => s.setNoteIcon);
  const setFolderColor = useVault((s) => s.setFolderColor);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!picker) return;
    setQuery("");
    const onDown = () => close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [picker, close]);

  if (!picker) return null;
  const left = Math.min(picker.x, window.innerWidth - 296);
  const top = Math.min(picker.y, window.innerHeight - 340);

  const q = query.trim().toLowerCase();
  const names = q ? NOTE_ICON_NAMES.filter((n) => n.toLowerCase().includes(q)) : NOTE_ICON_NAMES;

  return (
    <div className="picker" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      {picker.kind === "icon" ? (
        <>
          <div className="picker-search">
            <input
              value={query}
              autoFocus
              placeholder="Search icons…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="picker-grid">
            {names.map((name) => {
              const Ico = NOTE_ICONS[name];
              return (
                <button
                  key={name}
                  className="picker-icon"
                  title={name}
                  onClick={() => setNoteIcon(picker.target, name)}
                >
                  <Ico size={17} strokeWidth={1.9} />
                </button>
              );
            })}
            {names.length === 0 && <div className="picker-empty">No icons match “{query}”.</div>}
          </div>
          <button className="picker-clear" onClick={() => setNoteIcon(picker.target, null)}>
            Remove icon
          </button>
        </>
      ) : (
        <>
          <div className="picker-swatches">
            {FOLDER_PALETTE.map((c) => (
              <button
                key={c}
                className="picker-swatch"
                style={{ background: c }}
                onClick={() => setFolderColor(picker.target, c)}
              />
            ))}
          </div>
          <button className="picker-clear" onClick={() => setFolderColor(picker.target, null)}>
            Default colour
          </button>
        </>
      )}
    </div>
  );
}
