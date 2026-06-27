import { useState } from "react";
import { useMath } from "../math/useMath";
import Tex from "../math/Tex";
import MathPlot from "../math/MathPlot";
import MathBuilder from "../math/MathBuilder";
import CopyMenu, { type CopyOption } from "./CopyMenu";
import { evalNumber, type MathLine, type MathSymbol } from "../math/engine";
import { Plus, Trash } from "../icons";
import "./MathEngineView.css";

function lineOptions(line: MathLine): CopyOption[] {
  const opts: CopyOption[] = [{ label: "Value", text: line.result ?? "" }];
  if (line.tex) opts.push({ label: "LaTeX", text: line.tex });
  if (line.name) {
    opts.push(
      { label: "Reference {{ }}", text: `{{${line.name}}}` },
      { label: "Formula {{ :tex}}", text: `{{${line.name}:tex}}` },
      { label: "Both {{ :both}}", text: `{{${line.name}:both}}` },
      { label: "Assignment", text: `${line.name} = ${line.result}` },
    );
  }
  return opts;
}

function symbolOptions(s: MathSymbol): CopyOption[] {
  return [
    { label: "Value", text: s.value },
    { label: "Reference {{ }}", text: `{{${s.name}}}` },
    { label: "Formula {{ :tex}}", text: `{{${s.name}:tex}}` },
    { label: "LaTeX", text: s.tex },
    { label: "Assignment", text: `${s.name} = ${s.value}` },
  ];
}

export default function MathEngineView() {
  const source = useMath((s) => s.source);
  const setSource = useMath((s) => s.setSource);
  const result = useMath((s) => s.result);
  const plots = useMath((s) => s.plots);
  const addPlot = useMath((s) => s.addPlot);
  const updatePlot = useMath((s) => s.updatePlot);
  const removePlot = useMath((s) => s.removePlot);
  const params = useMath((s) => s.params);
  const addParam = useMath((s) => s.addParam);
  const updateParam = useMath((s) => s.updateParam);
  const removeParam = useMath((s) => s.removeParam);
  const reset = useMath((s) => s.reset);
  const precision = useMath((s) => s.precision);
  const setPrecision = useMath((s) => s.setPrecision);

  const [newPlot, setNewPlot] = useState("");
  const [newParam, setNewParam] = useState("");
  const [mode, setMode] = useState<"sheet" | "builder">("sheet");

  const yAt = (p: { expr: string; point: number }) => {
    const x = Number.isFinite(p.point) ? p.point : 0;
    const y = evalNumber(p.expr, { ...result.scope, x });
    return y == null ? "—" : Number(y.toFixed(4)).toString();
  };

  const symbols = [...result.symbols.values()];

  const allResults = result.lines
    .filter((l) => l.result != null || l.error)
    .map((l) => (l.name ? `${l.name} = ${l.result}` : `${l.source.trim()} = ${l.result ?? l.error}`))
    .join("\n");
  const plotBlock = `\`\`\`plot\n${plots.map((p) => `${p.expr} @ ${p.min}..${p.max}`).join("\n")}\n\`\`\``;
  const headerCopyOptions: CopyOption[] = [
    { label: "All results", text: allResults },
    { label: "As ```math block", text: "```math\n" + source + "\n```" },
    { label: "Sheet source", text: source },
  ];

  return (
    <main className="math-view">
      <header className="math-header">
        <div className="math-title">
          <h1>Math Engine</h1>
          <span className="math-subtitle">{symbols.length} symbols · live</span>
        </div>
        <div className="math-header-tools">
          <div className="math-mode">
            <button
              className={mode === "sheet" ? "active" : ""}
              onClick={() => setMode("sheet")}
            >
              Sheet
            </button>
            <button
              className={mode === "builder" ? "active" : ""}
              onClick={() => setMode("builder")}
            >
              Builder
            </button>
          </div>
          {mode === "sheet" && (
            <>
              <div className="precision-ctl" title="Significant digits">
                <button onClick={() => setPrecision(precision - 1)}>−</button>
                <span>{precision} digits</span>
                <button onClick={() => setPrecision(precision + 1)}>+</button>
              </div>
              <div className="copy-all">
                <CopyMenu options={headerCopyOptions} />
              </div>
              <button className="seg-btn" onClick={reset}>
                Reset
              </button>
            </>
          )}
        </div>
      </header>

      {mode === "builder" ? (
        <MathBuilder />
      ) : (
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
                  <span className="math-line-copy">
                    <CopyMenu options={lineOptions(line)} small />
                  </span>
                </div>
              ),
            )}
          </div>

          {symbols.length > 0 && (
            <>
              <div className="math-pane-label">Symbols · copy in any format</div>
              <div className="math-symbols">
                {symbols.map((s) => (
                  <div key={s.name} className="math-chip">
                    <span className="chip-name">{s.name}</span>
                    <span className="chip-val">{s.isFunction ? "ƒ" : s.value}</span>
                    <CopyMenu options={symbolOptions(s)} small />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="math-pane-label">Parameters · drag to change every result &amp; curve</div>
          <div className="math-params">
            {params.map((p) => (
              <div className="param-row" key={p.id}>
                <span className="param-name">{p.name}</span>
                <input
                  className="param-slider"
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={p.value}
                  onChange={(e) => updateParam(p.id, { value: Number(e.target.value) })}
                />
                <span className="param-value">{p.value}</span>
                <input
                  className="param-bound"
                  type="number"
                  title="min"
                  value={p.min}
                  onChange={(e) => updateParam(p.id, { min: Number(e.target.value) })}
                />
                <input
                  className="param-bound"
                  type="number"
                  title="max"
                  value={p.max}
                  onChange={(e) => updateParam(p.id, { max: Number(e.target.value) })}
                />
                <button className="param-remove" onClick={() => removeParam(p.id)}>
                  <Trash size={14} />
                </button>
              </div>
            ))}
            <form
              className="param-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (newParam.trim()) {
                  addParam(newParam.trim());
                  setNewParam("");
                }
              }}
            >
              <Plus size={14} />
              <input
                value={newParam}
                placeholder="add a variable, e.g. a — then use it in a plot like a*x^2"
                onChange={(e) => setNewParam(e.target.value)}
              />
            </form>
          </div>

          <div className="math-pane-label spread">
            <span>Plots · drag on the chart to read values</span>
            <CopyMenu options={[{ label: "Embed as ```plot", text: plotBlock }]} small />
          </div>
          <div className="math-plot-wrap">
            <MathPlot
              plots={plots}
              scope={result.scope}
              onPointDrag={(id, x) => updatePlot(id, { point: x })}
            />
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
                <span className="plot-point-ctl">
                  <span className="plot-at">x</span>
                  <input
                    className="plot-range"
                    type="number"
                    value={Number.isFinite(p.point) ? Number(p.point.toFixed(3)) : 0}
                    step={Math.max(0.01, (p.max - p.min) / 100)}
                    onChange={(e) => updatePlot(p.id, { point: Number(e.target.value) })}
                  />
                  <span className="plot-yout" style={{ color: p.color }}>
                    → {yAt(p)}
                  </span>
                </span>
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
      )}
    </main>
  );
}
