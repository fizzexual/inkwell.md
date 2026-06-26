import { create } from "zustand";
import { vault } from "../data/vault";
import type { Note } from "../data/vault";
import {
  buildTree,
  buildGraph,
  buildLinkMap,
  buildBacklinks,
  titleResolver,
  type TreeFolder,
} from "../data/derive";
import { buildContents } from "../data/content";
import type { Resolver } from "../markdown";

export type SidebarView = "stats" | "notes" | "graph" | "search";
export type MapView = "links" | "sources";
export type CenterView = "graph" | "article";

interface Derived {
  tree: TreeFolder;
  graph: ReturnType<typeof buildGraph>;
  linkMap: Map<string, string[]>;
  backlinkMap: Map<string, string[]>;
  notesById: Map<string, Note>;
  resolve: Resolver;
}

function derive(notes: Note[]): Derived {
  const resolve = titleResolver(notes);
  const linkMap = buildLinkMap(notes, resolve);
  return {
    tree: buildTree(notes, vault.name),
    graph: buildGraph(notes, linkMap),
    linkMap,
    backlinkMap: buildBacklinks(linkMap),
    notesById: new Map(notes.map((n) => [n.id, n])),
    resolve,
  };
}

const seedContents = buildContents(vault);
const seedNotes: Note[] = vault.notes.map((n) => ({ ...n, content: seedContents[n.id] }));

interface VaultState extends Derived {
  vaultName: string;
  notes: Note[];
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
  linksOf: (id: string) => Note[];
  backlinksOf: (id: string) => Note[];
}

export const useVault = create<VaultState>((set, get) => ({
  vaultName: vault.name,
  notes: seedNotes,
  ...derive(seedNotes),
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
    set((s) => {
      const notes = s.notes.map((n) => (n.id === id ? { ...n, content: md } : n));
      return { notes, ...derive(notes) };
    }),
  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
  linksOf: (id) => {
    const { linkMap, notesById } = get();
    return (linkMap.get(id) ?? []).map((t) => notesById.get(t)).filter((n): n is Note => !!n);
  },
  backlinksOf: (id) => {
    const { backlinkMap, notesById } = get();
    return (backlinkMap.get(id) ?? []).map((t) => notesById.get(t)).filter((n): n is Note => !!n);
  },
}));
