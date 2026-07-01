import { create } from "zustand";
import { useVault } from "./store/useVault";

export interface Version {
  t: number; // epoch ms
  content: string;
}

const KEY = "inkwell.history.v1";
const MAX_PER_NOTE = 40;
const MAX_CONTENT = 60000; // don't snapshot huge notes (e.g. pasted images)

function load(): Record<string, Version[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

interface HistState {
  versions: Record<string, Version[]>;
  record: (id: string, content: string, at: number) => void;
  clear: (id: string) => void;
}

function persist(s: HistState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s.versions));
  } catch {
    /* quota — drop silently */
  }
}

export const useHistory = create<HistState>((set, get) => ({
  versions: load(),
  record: (id, content, at) => {
    if (content.length > MAX_CONTENT) return;
    const list = get().versions[id] ?? [];
    if (list[0]?.content === content) return; // unchanged since last snapshot
    const next = [{ t: at, content }, ...list].slice(0, MAX_PER_NOTE);
    set((s) => ({ versions: { ...s.versions, [id]: next } }));
    persist(get());
  },
  clear: (id) =>
    set((s) => {
      const versions = { ...s.versions };
      delete versions[id];
      persist({ ...s, versions });
      return { versions };
    }),
}));

// ---- auto-snapshot: throttled per note, captures the state *before* an editing burst ----
const lastSnap = new Map<string, number>();
const seen = new Map<string, string>();
const THROTTLE = 90_000;

export function startHistory() {
  useVault.subscribe((s) => {
    const id = s.selectedId;
    const note = s.notesById.get(id);
    if (!note) return;
    const content = note.content ?? "";
    const prev = seen.get(id);
    seen.set(id, content);
    if (prev === undefined || prev === content) return;
    const now = Date.now();
    if (now - (lastSnap.get(id) ?? 0) < THROTTLE) return;
    lastSnap.set(id, now);
    useHistory.getState().record(id, prev, now); // snapshot how it looked before this burst
  });
}
