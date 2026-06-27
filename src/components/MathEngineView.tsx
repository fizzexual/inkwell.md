import { useState } from "react";
import { useMath } from "../math/useMath";
import { useVault } from "../store/useVault";
import Tex from "../math/Tex";
import MathPlot from "../math/MathPlot";
import { Copy, Plus, Trash } from "../icons";
import "./MathEngineView.css";

export default function MathEngineView() {
  const source = useMath((s) => s.source);
  const setSource = useMath((s) => s.setSource);
  const result = useMath((s) => s.result);
  const plots = useMath((s) => s.plots);
  const addPlot = useMath((s) => s.addPlot);
  const updatePlot = useMath((s) => s.updatePlot);
  const removePlot = useMath((s) => s.removePlot);
  const reset = useMath((s) => s.reset);
  const toast = useVault((s) => s.toast);

  const [newPlot, setNewPlot] = useState("");

  const symbols = [...result.symbols.values()];
  const copyRef = (name: string) => {
    navigator.clipboard?.writeText(`{{${name}}}`);
    toast(`Copied {{${name}}} — paste into any note`);
  };

  return (
    <main className="math-view">
      <header className="math-header">
        <div className="math-title">
          <h1>Math Engine</h1>
          <span className="math-subtitle">{symbols.length} symbols · live</span>
        </div>
        <button className="seg-btn" onClick={reset}>
          Reset
        </button>
      </header>

      <div className="math-body">
        <div className="math-editor-pane">
          <div className="math-pane-label">Definitions</div>
          <textarea
            className="math-editor"
            value={source}
            spellCheck={false}
            onChange={(e) => setSource(e.target.value)}
            placeholder={"r = 5\narea = pi * r^2\nf(x) = sin(x)/x"}
          />
        </div>

        <div className="math-results-pane">
          <div className="math-pane-label">Results</div>
          <div className="math-results">
            {result.lines.map((line, i) =>
              line.isBlank ? (
                <div className="math-spacer" key={i} />
              ) : line.isComment ? (
                <div className="math-comment" key={i}>
                  {line.source.replace(/^#\s?/, "")}
                </div>
              ) : line.error ? (
                <div className="math-line error" key={i}>
                  <span className="math-src">{line.source.trim()}</span>
                  <span className="math-err">⚠ {line.error}</span>
                </div>
              ) : (
                <div className="math-line" key={i}>
                  {line.tex ? <Tex tex={line.tex} /> : <span className="math-src">{line.source.trim()}</span>}
                  <span className="math-eq">=</span>
                  <span className="math-val">{line.result}</span>
                </div>
              ),
            )}
          </div>

          {symbols.length > 0 && (
            <>
              <div className="math-pane-label">Symbols · click to copy a reference</div>
              <div className="math-symbols">
                {symbols.map((s) => (
                  <button key={s.name} className="math-chip" onClick={() => copyRef(s.name)}>
                    <span className="chip-name">{s.name}</span>
                    <span className="chip-val">{s.isFunction ? "ƒ" : s.value}</span>
                    <Copy size={12} />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="math-pane-label">Plots</div>
          <div className="math-plot-wrap">
            <MathPlot plots={plots} scope={result.scope} />
          </div>
          <div className="plot-list">
            {plots.map((p) => (
              <div className="plot-row" key={p.id}>
                <span className="plot-swatch" style={{ background: p.color }} />
                <span className="plot-eq">y =</span>
                <input
                  className="plot-expr"
                  value={p.expr}
                  onChange={(e) => updatePlot(p.id, { expr: e.target.value })}
                />
                <input
                  className="plot-range"
                  type="number"
                  value={p.min}
                  onChange={(e) => updatePlot(p.id, { min: Number(e.target.value) })}
                />
                <span className="plot-dash">…</span>
                <input
                  className="plot-range"
                  type="number"
                  value={p.max}
                  onChange={(e) => updatePlot(p.id, { max: Number(e.target.value) })}
                />
                <button className="plot-remove" onClick={() => removePlot(p.id)}>
                  <Trash size={14} />
                </button>
              </div>
            ))}
            <form
              className="plot-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (newPlot.trim()) {
                  addPlot(newPlot.trim());
                  setNewPlot("");
                }
              }}
            >
              <Plus size={14} />
              <input
                value={newPlot}
                placeholder="plot an expression, e.g. cos(x) or f(x)"
                onChange={(e) => setNewPlot(e.target.value)}
              />
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
