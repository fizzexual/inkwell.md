import { useEffect, useMemo, useRef, useState } from "react";
import { ComputeEngine } from "@cortex-js/compute-engine";
import { useVault } from "../store/useVault";
import Tex from "./Tex";
import CopyMenu from "../components/CopyMenu";
import "./MathBuilder.css";

const ce = new ComputeEngine();

interface Solved {
  simplified: string;
  value: string;
  ok: boolean;
}

function solve(latex: string): Solved | null {
  if (!latex.trim()) return null;
  try {
    const expr = ce.parse(latex);
    const simplified = expr.simplify();
    const numeric = expr.N();
    const v = numeric.valueOf();
    let value = "";
    if (typeof v === "number") value = Number.isFinite(v) ? String(+v.toPrecision(8)) : "";
    else if (typeof v === "string" || typeof v === "boolean") value = String(v);
    else value = numeric.isValid ? numeric.latex : "";
    return { simplified: simplified.latex, value, ok: true };
  } catch {
    return null;
  }
}

const TEMPLATES: { label: string; latex: string }[] = [
  { label: "Fraction", latex: "\\frac{\\square}{\\square}" },
  { label: "Power", latex: "\\square^{\\square}" },
  { label: "Square root", latex: "\\sqrt{\\square}" },
  { label: "Integral", latex: "\\int_{\\square}^{\\square}\\square\\,dx" },
  { label: "Sum", latex: "\\sum_{\\square}^{\\square}\\square" },
  { label: "Derivative", latex: "\\frac{d}{dx}\\square" },
];

export default function MathBuilder() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mfRef = useRef<{ value: string; focus: () => void; executeCommand: (c: unknown) => void } | null>(null);
  const [latex, setLatex] = useState("");
  const createNoteWith = useVault((s) => s.createNoteWith);
  const toast = useVault((s) => s.toast);

  useEffect(() => {
    let cancelled = false;
    let mf: HTMLElement | null = null;
    import("mathlive").then(({ MathfieldElement }) => {
      if (cancelled || !hostRef.current) return;
      MathfieldElement.fontsDirectory = "https://unpkg.com/mathlive@0.110.0/dist/fonts";
      MathfieldElement.soundsDirectory = null;
      const el = new MathfieldElement();
      el.style.width = "100%";
      el.style.minHeight = "64px";
      el.style.fontSize = "1.7rem";
      (el as unknown as { mathVirtualKeyboardPolicy: string }).mathVirtualKeyboardPolicy = "auto";
      el.addEventListener("input", () => setLatex((el as unknown as { value: string }).value));
      hostRef.current.appendChild(el);
      mfRef.current = el as unknown as typeof mfRef.current;
      (el as unknown as { focus: () => void }).focus();
      mf = el;
    });
    return () => {
      cancelled = true;
      mf?.remove();
    };
  }, []);

  const result = useMemo(() => solve(latex), [latex]);

  const insert = (template: string) => {
    mfRef.current?.executeCommand(["insert", template]);
    mfRef.current?.focus();
  };

  const newNote = () => {
    if (!result) return;
    const body = `# Solved problem\n\n$$${latex}$$\n\n**Result:** $${result.simplified}$ = ${result.value || "—"}\n`;
    createNoteWith("Solved problem", body, "Math");
    toast("Saved to a new note");
  };

  return (
    <div className="math-builder">
      <div className="builder-stage">
        <div className="builder-label">Build your problem — tap symbols, no typing needed</div>
        <div className="builder-field" ref={hostRef} />
        <div className="builder-templates">
          {TEMPLATES.map((t) => (
            <button key={t.label} className="tmpl-btn" onClick={() => insert(t.latex)}>
              <Tex tex={t.latex.replace(/\\square/g, "\\square")} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="builder-result">
        {!latex.trim() ? (
          <div className="builder-empty">Start building above — the answer appears here as you go.</div>
        ) : result?.ok ? (
          <>
            <div className="result-label">Result</div>
            <div className="result-main">
              <Tex tex={result.simplified} display />
            </div>
            {result.value && result.value !== result.simplified && (
              <div className="result-numeric">≈ {result.value}</div>
            )}
            <div className="result-actions">
              <button className="seg-btn" onClick={newNote}>
                Save as note
              </button>
              <CopyMenu
                options={[
                  { label: "LaTeX", text: latex },
                  { label: "Result", text: result.value || result.simplified },
                  { label: "As $math$", text: `$${latex}$` },
                  { label: "As $$block$$", text: `$$${latex}$$` },
                ]}
              />
            </div>
          </>
        ) : (
          <div className="builder-empty">Keep going — that's not a complete expression yet.</div>
        )}
      </div>
    </div>
  );
}
