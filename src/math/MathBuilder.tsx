import { useMemo, useState, type ReactNode } from "react";
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
  act?: "back" | "clear";
  className?: string;
}

const FUNCTIONS: Key[] = [
  { label: "sin", insert: "sin()", caret: 4 },
  { label: "cos", insert: "cos()", caret: 4 },
  { label: "tan", insert: "tan()", caret: 4 },
  { label: "ln", insert: "ln()", caret: 3 },
  { label: "log", insert: "log()", caret: 4 },
  { label: <>√</>, insert: "sqrt()", caret: 5 },
  { label: <>x²</>, insert: "^2" },
  { label: <>xⁿ</>, insert: "^" },
  { label: "π", insert: "pi" },
  { label: "e", insert: "e" },
  { label: "x", insert: "x", className: "key-var" },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: ",", insert: "," },
];

const PAD: Key[] = [
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "÷", insert: "/", className: "key-op" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "×", insert: "*", className: "key-op" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "−", insert: "-", className: "key-op" },
  { label: "0", insert: "0" },
  { label: ".", insert: "." },
  { label: "⌫", act: "back", className: "key-op" },
  { label: "+", insert: "+", className: "key-op" },
];

export default function MathBuilder() {
  const [expr, setExpr] = useState("");
  const [cursor, setCursor] = useState(0);
  const scope = useMath((s) => s.result.scope);
  const createNoteWith = useVault((s) => s.createNoteWith);
  const toast = useVault((s) => s.toast);

  const apply = (k: Key) => {
    if (k.act === "clear") {
      setExpr("");
      setCursor(0);
      return;
    }
    if (k.act === "back") {
      if (cursor > 0) {
        setExpr(expr.slice(0, cursor - 1) + expr.slice(cursor));
        setCursor(cursor - 1);
      }
      return;
    }
    if (k.insert != null) {
      setExpr(expr.slice(0, cursor) + k.insert + expr.slice(cursor));
      setCursor(cursor + (k.caret ?? k.insert.length));
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
        /* valid syntax but not evaluable (free var etc.) — show pretty form only */
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
        <div className="builder-label">Build your problem — tap to add, click in the line to move</div>

        {/* clickable input line */}
        <div
          className="bld-input"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCursor(expr.length);
          }}
        >
          {expr.length === 0 && <span className="bld-ph">tap a key to start…</span>}
          {Array.from({ length: expr.length + 1 }).map((_, i) => (
            <span key={i} className="bld-slot">
              {i === cursor && <span className="bld-caret" />}
              {i < expr.length && (
                <span className="bld-char" onMouseDown={() => setCursor(i)}>
                  {expr[i]}
                </span>
              )}
            </span>
          ))}
        </div>

        {/* live pretty render + result */}
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
        <div className="key-grid functions">
          {FUNCTIONS.map((k, i) => (
            <button key={i} className={"mkey " + (k.className ?? "")} onClick={() => apply(k)}>
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
