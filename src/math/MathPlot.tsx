import { useMemo, useRef, useState } from "react";
import { buildPlotGeometry, PLOT_W, PLOT_H, PLOT_PAD } from "./plot";
import { evalNumber } from "./engine";
import type { Plot } from "./useMath";

interface Props {
  plots: Plot[];
  scope: Record<string, unknown>;
  height?: number;
}

export default function MathPlot({ plots, scope, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const g = useMemo(() => buildPlotGeometry(plots, scope), [plots, scope]);

  const updateCursor = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * PLOT_W; // → viewBox x
    const [xMin, xMax] = g.xDomain;
    const dataX = xMin + ((vx - PLOT_PAD) / (PLOT_W - 2 * PLOT_PAD)) * (xMax - xMin);
    setCursorX(Math.max(xMin, Math.min(xMax, dataX)));
  };

  const readouts =
    cursorX == null
      ? []
      : plots.map((p) => ({
          color: p.color,
          expr: p.expr,
          y: evalNumber(p.expr, { ...scope, x: cursorX }),
        }));

  return (
    <svg
      ref={svgRef}
      className="math-plot interactive"
      viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
      style={{ height: height ?? 300, touchAction: "none" }}
      onPointerDown={(e) => {
        draggingRef.current = true;
        (e.target as SVGElement).setPointerCapture?.(e.pointerId);
        updateCursor(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current || e.buttons === 0) updateCursor(e.clientX);
      }}
      onPointerUp={() => (draggingRef.current = false)}
      onPointerLeave={() => {
        if (!draggingRef.current) setCursorX(null);
      }}
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

      {cursorX != null && (
        <>
          <line
            x1={g.sx(cursorX)}
            y1={PLOT_PAD}
            x2={g.sx(cursorX)}
            y2={PLOT_H - PLOT_PAD}
            className="plot-cursor"
          />
          {readouts.map((r, i) =>
            r.y == null ? null : (
              <circle key={i} cx={g.sx(cursorX)} cy={g.sy(r.y)} r={4.5} fill={r.color} className="plot-dot" />
            ),
          )}
          <g transform={`translate(${Math.min(g.sx(cursorX) + 10, PLOT_W - 150)}, ${PLOT_PAD + 8})`}>
            <rect className="plot-readout-bg" width={140} height={18 + readouts.length * 15} rx={5} />
            <text className="plot-readout x" x={8} y={14}>
              x = {cursorX.toFixed(2)}
            </text>
            {readouts.map((r, i) => (
              <text key={i} className="plot-readout" x={8} y={30 + i * 15} fill={r.color}>
                {r.y == null ? "—" : r.y.toFixed(3)}
              </text>
            ))}
          </g>
        </>
      )}

      <text x={PLOT_PAD} y={PLOT_H - 10} className="plot-label">
        x ∈ [{g.xDomain[0]}, {g.xDomain[1]}]
      </text>
      <text x={PLOT_W - PLOT_PAD} y={PLOT_H - 10} className="plot-label" textAnchor="end">
        drag to inspect
      </text>
    </svg>
  );
}
