import katex from "katex";
import { evaluateSheet, type MathResult } from "./engine";
import { plotToSvg } from "./plot";
import type { Plot } from "./useMath";
import type { MathCtx } from "../markdown";

const PLOT_COLORS = ["#6d4bd0", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
function tex(t: string): string {
  try {
    return katex.renderToString(t, { throwOnError: false, output: "html" });
  } catch {
    return esc(t);
  }
}

/** Evaluate a ```math block (inheriting the engine scope) into an HTML result list. */
function renderMathBlock(source: string, scope: Record<string, unknown>): string {
  const r = evaluateSheet(source, scope);
  const rows = r.lines
    .filter((l) => !l.isBlank)
    .map((l) => {
      if (l.isComment) return `<div class="mb-comment">${esc(l.source.replace(/^#\s?/, ""))}</div>`;
      if (l.error)
        return `<div class="mb-row mb-error"><code>${esc(l.source.trim())}</code><span class="mb-err">⚠ ${esc(l.error)}</span></div>`;
      const lhs = l.tex ? tex(l.tex) : `<code>${esc(l.source.trim())}</code>`;
      return `<div class="mb-row">${lhs}<span class="mb-eq">=</span><span class="mb-val">${esc(l.result ?? "")}</span></div>`;
    })
    .join("");
  return `<div class="math-block">${rows}</div>`;
}

/** Render a ```plot block: one expression per line, optional `@ min..max`. */
function renderPlotBlock(source: string, scope: Record<string, unknown>): string {
  const plots: Plot[] = source
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"))
    .map((line, i) => {
      const [expr, range] = line.split("@").map((s) => s.trim());
      const m = range?.match(/(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)/);
      return {
        id: `b${i}`,
        expr,
        color: PLOT_COLORS[i % PLOT_COLORS.length],
        min: m ? Number(m[1]) : -10,
        max: m ? Number(m[2]) : 10,
      };
    });
  if (!plots.length) return "";
  return `<div class="math-block math-block-plot">${plotToSvg(plots, scope)}</div>`;
}

export function buildMathCtx(result: MathResult): MathCtx {
  return {
    symbol: (name) => {
      const s = result.symbols.get(name);
      return s ? { value: s.value, tex: s.tex } : undefined;
    },
    scope: result.scope,
    block: (lang, source) =>
      lang === "plot" ? renderPlotBlock(source, result.scope) : renderMathBlock(source, result.scope),
  };
}
