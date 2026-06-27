import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { parse } from "mathjs";
import { useMath } from "./useMath";
import { useVault } from "../store/useVault";
import { formatValue } from "./engine";
import Tex from "./Tex";
import CopyMenu from "../components/CopyMenu";
import "./MathBuilder.css";

interface Key {
  label: ReactNode;
  insert?: string; // text to splice at the cursor
  caret?: number; // cursor offset within the inserted text (default = end)
  act?: "back" | "clear" | "left" | "right";
  className?: string;
}

const FUNCTIONS: Key[] = [
  { label: "sin", insert: "sin()", caret: 4 },
  { label: "cos", insert: "cos()", caret: 4 },
  { label: "tan", insert: "tan()", caret: 4 },
  { label: "asin", insert: "asin()", caret: 5 },
  { label: "acos", insert: "acos()", caret: 5 },
  { label: "atan", insert: "atan()", caret: 5 },
  { label: "ln", insert: "ln()", caret: 3 },
  { label: "log", insert: "log10()", caret: 6 },
  { label: <>√</>, insert: "sqrt()", caret: 5 },
  { label: <>∛</>, insert: "cbrt()", caret: 5 },
  { label: "|x|", insert: "abs()", caret: 4 },
  { label: <>eˣ</>, insert: "exp()", caret: 4 },
  { label: <>x²</>, insert: "^2" },
  { label: <>xⁿ</>, insert: "^" },
  { label: "n!", insert: "!" },
  { label: "mod", insert: " mod ", className: "key-op" },
  { label: "π", insert: "pi", className: "key-const" },
  { label: "e", insert: "e", className: "key-const" },
  { label: "τ", insert: "tau", className: "key-const" },
  { label: "i", insert: "i", className: "key-const" },
  { label: "x", insert: "x", className: "key-var" },
  { label: ",", insert: ", " },
];

const PAD: Key[] = [
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "^", insert: "^" },
  { label: "÷", insert: "/", className: "key-op" },
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "×", insert: "*", className: "key-op" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "−", insert: "-", className: "key-op" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "+", insert: "+", className: "key-op" },
  { label: "0", insert: "0" },
  { label: ".", insert: "." },
  { label: "⌫", act: "back", className: "key-op" },
  { label: "↵", act: "right", className: "key-op" },
];

export default function MathBuilder() {
  const [expr, setExpr] = useState("");
  const [cursor, setCursor] = useState(0);
  const scope = useMath((s) => s.result.scope);
  const createNoteWith = useVault((s) => s.createNoteWith);
  const toast = useVault((s) => s.toast);
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const insertAt = (text: string, caretOffset?: number) => {
    setExpr(expr.slice(0, cursor) + text + expr.slice(cursor));
    setCursor(cursor + (caretOffset ?? text.length));
  };

  const apply = (k: Key) => {
    if (k.act === "clear") return (setExpr(""), setCursor(0));
    if (k.act === "back") {
      if (cursor > 0) {
        setExpr(expr.slice(0, cursor - 1) + expr.slice(cursor));
        setCursor(cursor - 1);
      }
      return;
    }
    if (k.act === "left") return setCursor(Math.max(0, cursor - 1));
    if (k.act === "right") return setCursor(Math.min(expr.length, cursor + 1));
    if (k.insert != null) insertAt(k.insert, k.caret);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave app shortcuts alone
    const k = e.key;
    if (k === "Backspace") {
      e.preventDefault();
      apply({ label: "", act: "back" });
    } else if (k === "Delete") {
      e.preventDefault();
      if (cursor < expr.length) setExpr(expr.slice(0, cursor) + expr.slice(cursor + 1));
    } else if (k === "ArrowLeft") {
      e.preventDefault();
      setCursor(Math.max(0, cursor - 1));
    } else if (k === "ArrowRight") {
      e.preventDefault();
      setCursor(Math.min(expr.length, cursor + 1));
    } else if (k === "Home") {
      e.preventDefault();
      setCursor(0);
    } else if (k === "End") {
      e.preventDefault();
      setCursor(expr.length);
    } else if (k.length === 1) {
      e.preventDefault();
      insertAt(k);
    }
  };

  const { tex, result, error } = useMemo(() => {
    if (!expr.trim()) return { tex: "", result: null as string | null, error: false };
    try {
      const node = parse(expr);
      const tex = node.toTex();
      let result: string | null = null;
      try {
        result = formatValue(node.evaluate(scope));
      } catch {
        /* valid syntax, not evaluable (free variable, etc.) */
      }
      return { tex, result, error: false };
    } catch {
      return { tex: "", result: null, error: true };
    }
  }, [expr, scope]);

  const newNote = () => {
    const body = `# Solved problem\n\n$$${tex}$$\n\n**Result:** ${result ?? "—"}\n`;
    createNoteWith("Solved problem", body, "Math");
    toast("Saved to a new note");
  };

  return (
    <div className="math-builder">
      <div className="builder-stage">
        <div className="builder-label">Build with the keys or your keyboard — click in the line to move</div>

        <div
          ref={inputRef}
          className="bld-input"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCursor(expr.length);
          }}
        >
          {expr.length === 0 && <span className="bld-ph">tap a key or type…</span>}
          {Array.from({ length: expr.length + 1 }).map((_, i) => (
            <span key={i} className="bld-slot">
              {i === cursor && <span className="bld-caret" />}
              {i < expr.length && (
                <span className="bld-char" onMouseDown={(e) => (e.stopPropagation(), setCursor(i))}>
                  {expr[i]}
                </span>
              )}
            </span>
          ))}
        </div>

        <div className="bld-feedback">
          {tex ? <Tex tex={tex} display /> : <span className="bld-hint">{error ? "incomplete…" : ""}</span>}
          {result != null && (
            <div className="bld-result">
              = <strong>{result}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="builder-keys">
        <div className="key-functions">
          {FUNCTIONS.map((k, i) => (
            <button key={i} className={"mkey fkey " + (k.className ?? "")} onClick={() => apply(k)}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="key-grid numpad">
          {PAD.map((k, i) => (
            <button key={i} className={"mkey " + (k.className ?? "")} onClick={() => apply(k)}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="builder-actions">
          <button className="mkey key-clear" onClick={() => apply({ label: "C", act: "clear" })}>
            Clear
          </button>
          <button className="seg-btn" disabled={!result} onClick={newNote}>
            Save as note
          </button>
          <CopyMenu
            options={[
              { label: "Result", text: result ?? "" },
              { label: "Expression", text: expr },
              { label: "LaTeX", text: tex },
              { label: "As $math$", text: `$${tex}$` },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
