import { evalNumber } from "./engine";
import type { Plot } from "./useMath";

export const PLOT_W = 640;
export const PLOT_H = 360;
export const PLOT_PAD = 30;
const SAMPLES = 280;

export interface PlotGeom {
  paths: { d: string; color: string; expr: string }[];
  xDomain: [number, number];
  yDomain: [number, number];
  x0: number | null;
  y0: number | null;
}

export function buildPlotGeometry(plots: Plot[], scope: Record<string, unknown>): PlotGeom {
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
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad;
  yMax += pad;

  const sx = (x: number) => PLOT_PAD + ((x - xMin) / (xMax - xMin || 1)) * (PLOT_W - 2 * PLOT_PAD);
  const sy = (y: number) => PLOT_H - PLOT_PAD - ((y - yMin) / (yMax - yMin || 1)) * (PLOT_H - 2 * PLOT_PAD);

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

  return {
    paths,
    xDomain: [xMin, xMax],
    yDomain: [yMin, yMax],
    x0: xMin <= 0 && xMax >= 0 ? sx(0) : null,
    y0: yMin <= 0 && yMax >= 0 ? sy(0) : null,
  };
}

/** A standalone SVG string (for embedding a plot into rendered note HTML). */
export function plotToSvg(plots: Plot[], scope: Record<string, unknown>): string {
  const g = buildPlotGeometry(plots, scope);
  const axes =
    (g.y0 != null
      ? `<line x1="${PLOT_PAD}" y1="${g.y0}" x2="${PLOT_W - PLOT_PAD}" y2="${g.y0}" class="plot-axis"/>`
      : "") +
    (g.x0 != null
      ? `<line x1="${g.x0}" y1="${PLOT_PAD}" x2="${g.x0}" y2="${PLOT_H - PLOT_PAD}" class="plot-axis"/>`
      : "");
  const paths = g.paths
    .map((p) => `<path d="${p.d}" fill="none" stroke="${p.color}" stroke-width="1.8"/>`)
    .join("");
  return `<svg class="math-plot" viewBox="0 0 ${PLOT_W} ${PLOT_H}"><rect x="${PLOT_PAD}" y="${PLOT_PAD}" width="${PLOT_W - 2 * PLOT_PAD}" height="${PLOT_H - 2 * PLOT_PAD}" class="plot-frame"/>${axes}${paths}</svg>`;
}
