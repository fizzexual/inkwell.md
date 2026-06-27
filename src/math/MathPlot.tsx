import { useMemo, useRef, useState } from "react";
import { buildPlotGeometry, PLOT_W, PLOT_H, PLOT_PAD } from "./plot";
import { evalNumber } from "./engine";
import type { Plot } from "./useMath";

interface Props {
  plots: Plot[];
  scope: Record<string, unknown>;
  height?: number;
  onPointDrag?: (id: string, x: number) => void;
}

export default function MathPlot({ plots, scope, height, onPointDrag }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const g = useMemo(() => buildPlotGeometry(plots, scope), [plots, scope]);

  // each curve's draggable evaluation point: (x, y=f(x))
  const points = plots.map((p) => {
    const px = Number.isFinite(p.point) ? p.point : (p.min + p.max) / 2;
    return { plot: p, px, py: evalNumber(p.expr, { ...scope, x: px }) };
  });

  const dataXFromClient = (clientX: number, plot: Plot) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * PLOT_W;
    const [xMin, xMax] = g.xDomain;
    const dx = xMin + ((vx - PLOT_PAD) / (PLOT_W - 2 * PLOT_PAD)) * (xMax - xMin);
    return Math.max(plot.min, Math.min(plot.max, dx));
  };

  return (
    <svg
      ref={svgRef}
      className="math-plot"
      viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
      style={{ height: height ?? 300, touchAction: "none" }}
      onPointerMove={(e) => {
        if (!dragId || !onPointDrag) return;
        const plot = plots.find((p) => p.id === dragId);
        if (plot) onPointDrag(dragId, dataXFromClient(e.clientX, plot));
      }}
      onPointerUp={() => setDragId(null)}
      onPointerLeave={() => setDragId(null)}
    >
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

      {points.map(({ plot, px, py }) =>
        py == null ? null : (
          <g key={plot.id} className={"plot-point" + (dragId === plot.id ? " dragging" : "")}>
            {/* vertical guide from the point down to the x-axis */}
            <line x1={g.sx(px)} y1={g.sy(py)} x2={g.sx(px)} y2={PLOT_H - PLOT_PAD} className="point-guide" />
            <line x1={PLOT_PAD} y1={g.sy(py)} x2={g.sx(px)} y2={g.sy(py)} className="point-guide" />
            {/* readout label */}
            <g transform={`translate(${Math.min(g.sx(px) + 9, PLOT_W - 132)}, ${g.sy(py) - 26})`}>
              <rect className="point-readout-bg" width={124} height={20} rx={5} />
              <text className="point-readout" x={7} y={14} fill={plot.color}>
                ({px.toFixed(2)}, {py.toFixed(3)})
              </text>
            </g>
            {/* the draggable handle */}
            <circle
              cx={g.sx(px)}
              cy={g.sy(py)}
              r={13}
              className="point-hit"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as SVGElement).setPointerCapture?.(e.pointerId);
                setDragId(plot.id);
              }}
            />
            <circle cx={g.sx(px)} cy={g.sy(py)} r={6} fill={plot.color} className="point-dot" />
          </g>
        ),
      )}

      <text x={PLOT_PAD} y={PLOT_H - 10} className="plot-label">
        x ∈ [{g.xDomain[0]}, {g.xDomain[1]}]
      </text>
      <text x={PLOT_W - PLOT_PAD} y={PLOT_H - 10} className="plot-label" textAnchor="end">
        drag a point along its curve
      </text>
    </svg>
  );
}
