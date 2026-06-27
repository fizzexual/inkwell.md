import { useMemo } from "react";
import { evalNumber } from "./engine";
import type { Plot } from "./useMath";

const W = 640;
const H = 360;
const PAD = 30;
const SAMPLES = 280;

interface Props {
  plots: Plot[];
  scope: Record<string, unknown>;
  height?: number;
}

export default function MathPlot({ plots, scope, height }: Props) {
  const { paths, xDomain, yDomain, ticks } = useMemo(() => {
    const xMin = Math.min(...plots.map((p) => p.min), 0);
    const xMax = Math.max(...plots.map((p) => p.max), 0);
    const series = plots.map((p) => {
      const pts: ([number, number] | null)[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const x = p.min + ((p.max - p.min) * i) / SAMPLES;
        const y = evalNumber(p.expr, { ...scope, x });
        pts.push(y == null ? null : [x, y]);
      }
      return { plot: p, pts };
    });

    // y domain from finite samples, trimmed to tame singularities
    const ys = series
      .flatMap((s) => s.pts)
      .filter((p): p is [number, number] => !!p)
      .map((p) => p[1])
      .sort((a, b) => a - b);
    let yMin = ys.length ? ys[Math.floor(ys.length * 0.02)] : -1;
    let yMax = ys.length ? ys[Math.floor(ys.length * 0.98)] : 1;
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const yPad = (yMax - yMin) * 0.08;
    yMin -= yPad;
    yMax += yPad;

    const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD);
    const sy = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);

    const paths = series.map((s) => {
      let d = "";
      let pen = false;
      for (const pt of s.pts) {
        if (!pt || pt[1] < yMin - 1e6 || pt[1] > yMax + 1e6) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${sx(pt[0]).toFixed(1)} ${sy(pt[1]).toFixed(1)} `;
        pen = true;
      }
      return { d, color: s.plot.color, expr: s.plot.expr };
    });

    const ticks = {
      x0: xMin <= 0 && xMax >= 0 ? sx(0) : null,
      y0: yMin <= 0 && yMax >= 0 ? sy(0) : null,
    };

    return { paths, xDomain: [xMin, xMax], yDomain: [yMin, yMax], ticks };
  }, [plots, scope]);

  return (
    <svg className="math-plot" viewBox={`0 0 ${W} ${H}`} style={{ height: height ?? 300 }}>
      <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} className="plot-frame" />
      {ticks.y0 != null && <line x1={PAD} y1={ticks.y0} x2={W - PAD} y2={ticks.y0} className="plot-axis" />}
      {ticks.x0 != null && <line x1={ticks.x0} y1={PAD} x2={ticks.x0} y2={H - PAD} className="plot-axis" />}
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={1.8} />
      ))}
      <text x={PAD} y={H - 10} className="plot-label">
        x ∈ [{xDomain[0]}, {xDomain[1]}]
      </text>
      <text x={W - PAD} y={H - 10} className="plot-label" textAnchor="end">
        y ∈ [{yDomain[0].toFixed(1)}, {yDomain[1].toFixed(1)}]
      </text>
    </svg>
  );
}
