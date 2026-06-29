import { create } from "zustand";

export type Pt = [number, number];

export interface BoardStroke {
  id: string;
  color: string;
  width: number;
  pts: Pt[]; // world coordinates
}
export interface BoardNote {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
}
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

const KEY = "inkwell.board.v1";

interface Persisted {
  camera?: Camera;
  strokes?: BoardStroke[];
  notes?: BoardNote[];
}
function load(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
const saved = load();

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

interface BoardState {
  camera: Camera;
  strokes: BoardStroke[];
  notes: BoardNote[];
  setCamera: (c: Camera) => void;
  addStroke: (s: Omit<BoardStroke, "id">) => void;
  eraseAt: (x: number, y: number, r: number) => void;
  addNote: (x: number, y: number, color: string) => string;
  updateNote: (id: string, patch: Partial<BoardNote>) => void;
  removeNote: (id: string) => void;
  clear: () => void;
}

function persist(s: BoardState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ camera: s.camera, strokes: s.strokes, notes: s.notes }));
  } catch {
    /* ignore */
  }
}

export const useBoard = create<BoardState>((set, get) => ({
  camera: saved.camera ?? { x: 0, y: 0, scale: 1 },
  strokes: saved.strokes ?? [],
  notes: saved.notes ?? [],

  setCamera: (camera) => {
    set({ camera });
    persist(get());
  },
  addStroke: (s) => {
    set((p) => ({ strokes: [...p.strokes, { ...s, id: uid("s") }] }));
    persist(get());
  },
  eraseAt: (x, y, r) => {
    set((p) => ({
      strokes: p.strokes.filter((s) => !s.pts.some(([px, py]) => Math.hypot(px - x, py - y) < r + s.width)),
    }));
    persist(get());
  },
  addNote: (x, y, color) => {
    const id = uid("n");
    set((p) => ({ notes: [...p.notes, { id, x, y, w: 180, h: 120, text: "", color }] }));
    persist(get());
    return id;
  },
  updateNote: (id, patch) => {
    set((p) => ({ notes: p.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
    persist(get());
  },
  removeNote: (id) => {
    set((p) => ({ notes: p.notes.filter((n) => n.id !== id) }));
    persist(get());
  },
  clear: () => {
    set({ strokes: [], notes: [] });
    persist(get());
  },
}));

/** Smooth a list of points into an SVG path (quadratic midpoints). */
export function strokePath(pts: Pt[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]} l0.1,0.1` : "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    d += ` Q${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last[0]},${last[1]}`;
  return d;
}
