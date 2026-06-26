import { create } from "zustand";
import { vault } from "../data/vault";
import { buildTree, buildGraph } from "../data/derive";

export type SidebarView = "stats" | "notes" | "graph" | "search";
export type MapView = "links" | "sources";

const tree = buildTree(vault);
const graph = buildGraph(vault);

interface VaultState {
  tree: typeof tree;
  graph: typeof graph;
  selectedId: string;
  expanded: Set<string>;
  sidebarView: SidebarView;
  mapView: MapView;
  fitNonce: number;
  select: (id: string) => void;
  toggleFolder: (path: string) => void;
  setSidebarView: (v: SidebarView) => void;
  setMapView: (v: MapView) => void;
  requestFit: () => void;
}

export const useVault = create<VaultState>((set) => ({
  tree,
  graph,
  selectedId: "convolutional-neural-networks",
  expanded: new Set([
    "00 - Meta",
    "01 - Foundations",
    "02 - Neural Network Fundamentals",
    "03 - Training & Optimization",
  ]),
  sidebarView: "graph",
  mapView: "links",
  fitNonce: 0,
  select: (id) => set({ selectedId: id }),
  toggleFolder: (path) =>
    set((s) => {
      const next = new Set(s.expanded);
      next.has(path) ? next.delete(path) : next.add(path);
      return { expanded: next };
    }),
  setSidebarView: (v) => set({ sidebarView: v }),
  setMapView: (v) => set({ mapView: v }),
  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}));
