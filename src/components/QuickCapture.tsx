import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { listenEscape } from "../keys";
import "./QuickCapture.css";

export default function QuickCapture() {
  const open = useVault((s) => s.quickOpen);
  const setOpen = useVault((s) => s.setQuickOpen);
  // close on Esc wherever focus is (the input may not have focus yet, or was clicked away)
  useEffect(() => (open ? listenEscape(() => setOpen(false)) : undefined), [open, setOpen]);
  const quickCapture = useVault((s) => s.quickCapture);
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    quickCapture(text);
    setOpen(false);
  };

  return (
    <div className="qc-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="qc" onMouseDown={(e) => e.stopPropagation()}>
        <div className="qc-head">Quick capture → Inbox</div>
        <textarea
          ref={ref}
          value={text}
          placeholder="Jot a thought… Enter to save, Shift+Enter for a new line"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
        <div className="qc-foot">
          <span className="qc-hint">saved to your Inbox note</span>
          <button className="qc-save" disabled={!text.trim()} onClick={submit}>
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}
