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
  const tex = latex.trim();
  if (!tex) return null;
  // unfilled placeholders → the problem isn't complete yet
  if (/\\placeholder|\\square/.test(tex)) return null;
  try {
    const expr = ce.parse(tex);
    if (expr.isValid === false) return null;
    const simplified = expr.simplify();
    const sLatex = simplified.latex;
    if (!sLatex || sLatex.includes("\\error")) return null;
    const numeric = expr.N();
    const v = numeric?.valueOf?.();
    let value = "";
    if (typeof v === "number") value = Number.isFinite(v) ? String(+v.toPrecision(8)) : "";
    else if (typeof v === "string" && !v.includes("Error")) value = v;
    return { simplified: sLatex, value, ok: true };
  } catch {
    return null;
  }
}

// `preview` renders in the button via KaTeX (\square); `insert` goes into the
// math-field as real MathLive placeholders the user tabs through.
const TEMPLATES: { label: string; preview: string; insert: string }[] = [
  { label: "Fraction", preview: "\\frac{\\square}{\\square}", insert: "\\frac{\\placeholder{}}{\\placeholder{}}" },
  { label: "Power", preview: "\\square^{\\square}", insert: "{\\placeholder{}}^{\\placeholder{}}" },
  { label: "Square root", preview: "\\sqrt{\\square}", insert: "\\sqrt{\\placeholder{}}" },
  { label: "Integral", preview: "\\int_{\\square}^{\\square}\\square\\,dx", insert: "\\int_{\\placeholder{}}^{\\placeholder{}}\\placeholder{}\\,dx" },
  { label: "Sum", preview: "\\sum_{\\square}^{\\square}\\square", insert: "\\sum_{\\placeholder{}}^{\\placeholder{}}\\placeholder{}" },
  { label: "Derivative", preview: "\\frac{d}{dx}\\square", insert: "\\frac{d}{dx}\\placeholder{}" },
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
      el.style.cursor = "text";
      (el as unknown as { mathVirtualKeyboardPolicy: string }).mathVirtualKeyboardPolicy = "auto";
      // theme the field to match Inkwell (these custom props pierce the shadow DOM)
      const set = (k: string, v: string) => el.style.setProperty(k, v);
      el.style.background = "transparent";
      el.style.color = "var(--tx-1)";
      set("--caret-color", "var(--accent)");
      set("--primary-color", "var(--accent)");
      set("--text-font-family", "var(--font)");
      set("--selection-background-color", "var(--accent-weak)");
      set("--selection-color", "var(--accent-text)");
      set("--contains-highlight-background-color", "var(--accent-weak)");
      set("--placeholder-color", "var(--tx-3)");
      set("--placeholder-opacity", "0.7");
      set("--smart-fence-color", "var(--tx-3)");
      set("--correct-color", "var(--tl-green)");
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
            <button key={t.label} className="tmpl-btn" onClick={() => insert(t.insert)}>
              <Tex tex={t.preview} />
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
