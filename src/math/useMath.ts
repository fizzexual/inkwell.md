import { create } from "zustand";
import { evaluateSheet, type MathResult } from "./engine";

export interface Plot {
  id: string;
  expr: string; // expression in terms of x, e.g. "sin(x)/x" or "f(x)"
  color: string;
  min: number;
  max: number;
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

const DEFAULT_PLOTS: Plot[] = [{ id: "p0", expr: "f(x)", color: "#6d4bd0", min: -12, max: 12 }];

const STORAGE = "inkwell.math.v1";
interface Persisted {
  source?: string;
  plots?: Plot[];
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

interface MathState {
  source: string;
  result: MathResult;
  plots: Plot[];
  setSource: (src: string) => void;
  addPlot: (expr: string) => void;
  updatePlot: (id: string, patch: Partial<Plot>) => void;
  removePlot: (id: string) => void;
  reset: () => void;
}

const PLOT_COLORS = ["#6d4bd0", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
let plotSeq = DEFAULT_PLOTS.length;

export const useMath = create<MathState>((set) => ({
  source: initialSource,
  result: evaluateSheet(initialSource),
  plots: saved.plots ?? DEFAULT_PLOTS,
  setSource: (src) => set({ source: src, result: evaluateSheet(src) }),
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
  reset: () => set({ source: DEFAULT_SOURCE, result: evaluateSheet(DEFAULT_SOURCE), plots: DEFAULT_PLOTS }),
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
      localStorage.setItem(STORAGE, JSON.stringify({ source: s.source, plots: s.plots }));
    } catch {
      /* ignore */
    }
  });
});
