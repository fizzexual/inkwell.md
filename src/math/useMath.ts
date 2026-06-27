import { create } from "zustand";
import { evaluateSheet, type MathResult } from "./engine";

export interface Plot {
  id: string;
  expr: string; // expression in terms of x, e.g. "sin(x)/x" or "f(x)"
  color: string;
  min: number;
  max: number;
}

export interface Param {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

function paramScope(params: Param[]): Record<string, number> {
  return Object.fromEntries(params.map((p) => [p.name, p.value]));
}

const DEFAULT_SOURCE = `# Define variables — results show on the right
r = 5
area = pi * r^2

# Unit-aware math
speed = 5 km/h to m/s

# Symbolic algebra
slope = derivative("x^2 + 3 x", "x")

# Matrices
M = [1, 2; 3, 4]
detM = det(M)

# A function (plot it below)
f(x) = sin(x) / x`;

const DEFAULT_PLOTS: Plot[] = [
  { id: "p0", expr: "f(x)", color: "#6d4bd0", min: -12, max: 12 },
  { id: "p1", expr: "amp * sin(k * x)", color: "#3b82f6", min: -12, max: 12 },
];

const DEFAULT_PARAMS: Param[] = [
  { id: "k", name: "k", value: 1, min: 0, max: 5, step: 0.1 },
  { id: "amp", name: "amp", value: 1, min: 0, max: 3, step: 0.1 },
];

const STORAGE = "inkwell.math.v1";
interface Persisted {
  source?: string;
  plots?: Plot[];
  params?: Param[];
  precision?: number;
}
function load(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || "{}");
  } catch {
    return {};
  }
}
const saved = load();
const initialSource = saved.source ?? DEFAULT_SOURCE;
const initialPrecision = saved.precision ?? 6;
const initialParams = saved.params ?? DEFAULT_PARAMS;

interface MathState {
  source: string;
  result: MathResult;
  plots: Plot[];
  params: Param[];
  precision: number;
  setSource: (src: string) => void;
  setPrecision: (p: number) => void;
  addPlot: (expr: string) => void;
  updatePlot: (id: string, patch: Partial<Plot>) => void;
  removePlot: (id: string) => void;
  addParam: (name: string) => void;
  updateParam: (id: string, patch: Partial<Param>) => void;
  removeParam: (id: string) => void;
  reset: () => void;
}

const PLOT_COLORS = ["#6d4bd0", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
let plotSeq = DEFAULT_PLOTS.length;

let paramSeq = 0;

export const useMath = create<MathState>((set) => ({
  source: initialSource,
  result: evaluateSheet(initialSource, paramScope(initialParams), initialPrecision),
  plots: saved.plots ?? DEFAULT_PLOTS,
  params: initialParams,
  precision: initialPrecision,
  setSource: (src) =>
    set((s) => ({ source: src, result: evaluateSheet(src, paramScope(s.params), s.precision) })),
  setPrecision: (p) => {
    const precision = Math.max(2, Math.min(12, p));
    set((s) => ({ precision, result: evaluateSheet(s.source, paramScope(s.params), precision) }));
  },
  addParam: (name) =>
    set((s) => {
      const clean = name.trim().replace(/[^a-zA-Z0-9_]/g, "") || `p${paramSeq++}`;
      const params = [...s.params, { id: `q${paramSeq++}`, name: clean, value: 1, min: 0, max: 10, step: 0.1 }];
      return { params, result: evaluateSheet(s.source, paramScope(params), s.precision) };
    }),
  updateParam: (id, patch) =>
    set((s) => {
      const params = s.params.map((p) => (p.id === id ? { ...p, ...patch } : p));
      return { params, result: evaluateSheet(s.source, paramScope(params), s.precision) };
    }),
  removeParam: (id) =>
    set((s) => {
      const params = s.params.filter((p) => p.id !== id);
      return { params, result: evaluateSheet(s.source, paramScope(params), s.precision) };
    }),
  addPlot: (expr) =>
    set((s) => ({
      plots: [
        ...s.plots,
        {
          id: `p${plotSeq++}`,
          expr,
          color: PLOT_COLORS[s.plots.length % PLOT_COLORS.length],
          min: -10,
          max: 10,
        },
      ],
    })),
  updatePlot: (id, patch) =>
    set((s) => ({ plots: s.plots.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removePlot: (id) => set((s) => ({ plots: s.plots.filter((p) => p.id !== id) })),
  reset: () =>
    set({
      source: DEFAULT_SOURCE,
      result: evaluateSheet(DEFAULT_SOURCE, paramScope(DEFAULT_PARAMS), 6),
      plots: DEFAULT_PLOTS,
      params: DEFAULT_PARAMS,
      precision: 6,
    }),
}));

// persist source + plots
let queued = false;
useMath.subscribe(() => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    const s = useMath.getState();
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({
          source: s.source,
          plots: s.plots,
          params: s.params,
          precision: s.precision,
        }),
      );
    } catch {
      /* ignore */
    }
  });
});
