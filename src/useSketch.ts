import { create } from "zustand";

export interface Stroke {
  id: string;
  color: string;
  width: number;
  pts: [number, number][];
}

const STORAGE = "inkwell.sketch.v1";
function load(): Stroke[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || "[]");
  } catch {
    return [];
  }
}

let seq = 0;

interface SketchState {
  strokes: Stroke[];
  addStroke: (s: Omit<Stroke, "id">) => void;
  removeStroke: (id: string) => void;
  undo: () => void;
  clear: () => void;
}

export const useSketch = create<SketchState>((set) => ({
  strokes: load(),
  addStroke: (s) => set((st) => ({ strokes: [...st.strokes, { ...s, id: `s${seq++}` }] })),
  removeStroke: (id) => set((st) => ({ strokes: st.strokes.filter((x) => x.id !== id) })),
  undo: () => set((st) => ({ strokes: st.strokes.slice(0, -1) })),
  clear: () => set({ strokes: [] }),
}));

/** Build an SVG path "d" from a list of points. */
export function strokePath(pts: [number, number][]): string {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
}

let queued = false;
useSketch.subscribe(() => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(useSketch.getState().strokes));
    } catch {
      /* ignore */
    }
  });
});
