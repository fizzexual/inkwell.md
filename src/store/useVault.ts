import { create } from "zustand";
import { vault } from "../data/vault";
import { buildTree, buildGraph } from "../data/derive";
import { buildContents } from "../data/content";

export type SidebarView = "stats" | "notes" | "graph" | "search";
export type MapView = "links" | "sources";
export type CenterView = "graph" | "article";

const tree = buildTree(vault);
const graph = buildGraph(vault);
const initialContents = buildContents(vault);

interface VaultState {
  tree: typeof tree;
  graph: typeof graph;
  contents: Record<string, string>;
  selectedId: string;
  expanded: Set<string>;
  sidebarView: SidebarView;
  mapView: MapView;
  centerView: CenterView;
  editing: boolean;
  fitNonce: number;
  select: (id: string) => void;
  openArticle: (id: string) => void;
  toggleFolder: (path: string) => void;
  setSidebarView: (v: SidebarView) => void;
  setMapView: (v: MapView) => void;
  setCenterView: (v: CenterView) => void;
  setEditing: (v: boolean) => void;
  updateContent: (id: string, md: string) => void;
  requestFit: () => void;
}

export const useVault = create<VaultState>((set) => ({
  tree,
  graph,
  contents: initialContents,
  selectedId: "convolutional-neural-networks",
  expanded: new Set([
    "00 - Meta",
    "01 - Foundations",
    "02 - Neural Network Fundamentals",
    "03 - Training & Optimization",
  ]),
  sidebarView: "graph",
  mapView: "links",
  centerView: "graph",
  editing: false,
  fitNonce: 0,
  select: (id) => set({ selectedId: id }),
  openArticle: (id) => set({ selectedId: id, centerView: "article", sidebarView: "notes" }),
  toggleFolder: (path) =>
    set((s) => {
      const next = new Set(s.expanded);
      next.has(path) ? next.delete(path) : next.add(path);
      return { expanded: next };
    }),
  setSidebarView: (v) =>
    set(() => {
      if (v === "graph") return { sidebarView: v, centerView: "graph" as const };
      if (v === "notes") return { sidebarView: v, centerView: "article" as const };
      return { sidebarView: v };
    }),
  setMapView: (v) => set({ mapView: v }),
  setCenterView: (v) => set({ centerView: v }),
  setEditing: (v) => set({ editing: v }),
  updateContent: (id, md) =>
    set((s) => ({ contents: { ...s.contents, [id]: md } })),
  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}));
