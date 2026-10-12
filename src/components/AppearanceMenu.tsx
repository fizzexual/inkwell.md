import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { Palette, Sun, Moon, Focus } from "../icons";
import { RefreshCw } from "lucide-react";
import { inTauri } from "../tauri";
import { updatesEnabled } from "../updater/logic";
import { useUpdater } from "../updater/useUpdater";
import "./AppearanceMenu.css";

const ACCENTS = [
  { hex: "", label: "Default" },
  { hex: "#6d4bd0", label: "Purple" },
  { hex: "#3b82f6", label: "Blue" },
  { hex: "#0ea5e9", label: "Sky" },
  { hex: "#10b981", label: "Green" },
  { hex: "#f59e0b", label: "Amber" },
  { hex: "#ef4444", label: "Red" },
  { hex: "#ec4899", label: "Pink" },
  { hex: "#14b8a6", label: "Teal" },
  { hex: "#6366f1", label: "Indigo" },
];

export default function AppearanceMenu() {
  const theme = useVault((s) => s.theme);
  const toggleTheme = useVault((s) => s.toggleTheme);
  const accent = useVault((s) => s.accent);
  const setAccent = useVault((s) => s.setAccent);
  const toggleZen = useVault((s) => s.toggleZen);
  const checking = useUpdater((s) => s.phase === "checking");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className="appearance" ref={ref}>
      <button
        className={"titlebar-btn" + (open ? " on" : "")}
        aria-label="Appearance"
        title="Appearance"
        onClick={() => setOpen((o) => !o)}
      >
        <Palette size={15} />
      </button>
      {open && (
        <div className="appearance-pop">
          <div className="appearance-row">
            <button className="appearance-mode" onClick={toggleTheme}>
              {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <button
              className="appearance-mode"
              onClick={() => {
                toggleZen();
                setOpen(false);
              }}
            >
              <Focus size={14} />
              Focus
            </button>
          </div>
          <div className="appearance-label">Accent</div>
          <div className="appearance-swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.hex || "default"}
                className={"appearance-swatch" + (accent === a.hex ? " active" : "")}
                title={a.label}
                style={a.hex ? { background: a.hex } : undefined}
                data-default={a.hex ? undefined : ""}
                onClick={() => setAccent(a.hex)}
              />
            ))}
          </div>
          {updatesEnabled({ inTauri, prod: import.meta.env.PROD }) && (
            <button
              className="appearance-mode appearance-update"
              onClick={() => void useUpdater.getState().checkForUpdates("manual")}
            >
              <RefreshCw size={13} className={checking ? "spinning" : undefined} />
              {checking ? "Checking…" : "Check for updates"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
