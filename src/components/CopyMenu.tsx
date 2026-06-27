import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { Copy } from "../icons";
import "./CopyMenu.css";

export interface CopyOption {
  label: string;
  text: string;
}

export default function CopyMenu({ options, small }: { options: CopyOption[]; small?: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const toast = useVault((s) => s.toast);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  const open = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 252) });
  };

  const copy = (o: CopyOption) => {
    navigator.clipboard?.writeText(o.text);
    toast(`Copied ${o.label.toLowerCase()}`);
    setPos(null);
  };

  return (
    <>
      <button
        ref={btnRef}
        className={"copy-btn" + (small ? " sm" : "") + (pos ? " active" : "")}
        title="Copy…"
        onPointerDown={open}
      >
        <Copy size={small ? 12 : 14} />
      </button>
      {pos && (
        <div className="copy-pop" style={{ top: pos.top, left: pos.left }} onPointerDown={(e) => e.stopPropagation()}>
          {options.map((o) => (
            <button key={o.label} className="copy-opt" onClick={() => copy(o)}>
              <span className="copy-label">{o.label}</span>
              <code className="copy-preview">{o.text.replace(/\n/g, " ⏎ ")}</code>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
