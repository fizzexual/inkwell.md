import { useMemo } from "react";
import { buildPlotGeometry, PLOT_W, PLOT_H, PLOT_PAD } from "./plot";
import type { Plot } from "./useMath";

interface Props {
  plots: Plot[];
  scope: Record<string, unknown>;
  height?: number;
}

export default function MathPlot({ plots, scope, height }: Props) {
  const g = useMemo(() => buildPlotGeometry(plots, scope), [plots, scope]);

  return (
    <svg className="math-plot" viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} style={{ height: height ?? 300 }}>
      <rect
        x={PLOT_PAD}
        y={PLOT_PAD}
        width={PLOT_W - 2 * PLOT_PAD}
        height={PLOT_H - 2 * PLOT_PAD}
        className="plot-frame"
      />
      {g.y0 != null && (
        <line x1={PLOT_PAD} y1={g.y0} x2={PLOT_W - PLOT_PAD} y2={g.y0} className="plot-axis" />
      )}
      {g.x0 != null && (
        <line x1={g.x0} y1={PLOT_PAD} x2={g.x0} y2={PLOT_H - PLOT_PAD} className="plot-axis" />
      )}
      {g.paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={1.8} />
      ))}
      <text x={PLOT_PAD} y={PLOT_H - 10} className="plot-label">
        x ∈ [{g.xDomain[0]}, {g.xDomain[1]}]
      </text>
      <text x={PLOT_W - PLOT_PAD} y={PLOT_H - 10} className="plot-label" textAnchor="end">
        y ∈ [{g.yDomain[0].toFixed(1)}, {g.yDomain[1].toFixed(1)}]
      </text>
    </svg>
  );
}
