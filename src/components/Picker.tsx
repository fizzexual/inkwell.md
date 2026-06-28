import { useEffect } from "react";
import { useVault } from "../store/useVault";
import { FOLDER_PALETTE } from "../folders";
import "./Picker.css";

const EMOJIS = [
  "📄", "📝", "⭐", "🔖", "💡", "📌", "🎯", "🔬", "📚", "🧪", "🧠", "🚀",
  "🔧", "🎨", "📊", "🗺️", "✅", "❓", "⚠️", "🔥", "💬", "📐", "🧩", "🌱",
];

export default function Picker() {
  const picker = useVault((s) => s.picker);
  const close = useVault((s) => s.closePicker);
  const setNoteIcon = useVault((s) => s.setNoteIcon);
  const setFolderColor = useVault((s) => s.setFolderColor);

  useEffect(() => {
    if (!picker) return;
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
  const left = Math.min(picker.x, window.innerWidth - 240);
  const top = Math.min(picker.y, window.innerHeight - 200);

  return (
    <div className="picker" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      {picker.kind === "icon" ? (
        <>
          <div className="picker-grid">
            {EMOJIS.map((e) => (
              <button key={e} className="picker-emoji" onClick={() => setNoteIcon(picker.target, e)}>
                {e}
              </button>
            ))}
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
