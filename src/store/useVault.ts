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

const STORAGE_KEY = "inkwell.vault.v1";
interface Persisted {
  contents?: Record<string, string>;
  newNotes?: Note[];
  selectedId?: string;
  expanded?: string[];
  sidebarView?: SidebarView;
  centerView?: CenterView;
  mapView?: MapView;
}
function loadPersisted(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
const persisted = loadPersisted();

const seedIds = new Set(vault.notes.map((n) => n.id));
const seedNotes: Note[] = [
  ...vault.notes.map((n) => ({
    ...n,
    content: persisted.contents?.[n.id] ?? seedContents[n.id],
  })),
  ...(persisted.newNotes ?? []).filter((n) => !seedIds.has(n.id)),
];

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
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  openTag: (tag: string) => void;
  select: (id: string) => void;
  openArticle: (id: string) => void;
  toggleFolder: (path: string) => void;
  setSidebarView: (v: SidebarView) => void;
  setMapView: (v: MapView) => void;
  setCenterView: (v: CenterView) => void;
  setEditing: (v: boolean) => void;
  updateContent: (id: string, md: string) => void;
  createNote: (folder?: string) => void;
  requestFit: () => void;
  linksOf: (id: string) => Note[];
  backlinksOf: (id: string) => Note[];
}

export const useVault = create<VaultState>((set, get) => ({
  vaultName: vault.name,
  notes: seedNotes,
  ...derive(seedNotes),
  selectedId: persisted.selectedId ?? "convolutional-neural-networks",
  expanded: new Set(
    persisted.expanded ?? [
      "00 - Meta",
      "01 - Foundations",
      "02 - Neural Network Fundamentals",
      "03 - Training & Optimization",
    ],
  ),
  sidebarView: persisted.sidebarView ?? "graph",
  mapView: persisted.mapView ?? "links",
  centerView: persisted.centerView ?? "graph",
  editing: false,
  fitNonce: 0,
  paletteOpen: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  openTag: (tag) => set({ searchQuery: `#${tag}`, sidebarView: "search" }),
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
      const heading = md.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
      const notes = s.notes.map((n) =>
        n.id === id ? { ...n, content: md, title: heading || n.title } : n,
      );
      return { notes, ...derive(notes) };
    }),
  createNote: (folder = "") =>
    set((s) => {
      const titles = new Set(s.notes.map((n) => n.title));
      let title = "Untitled Note";
      for (let i = 2; titles.has(title); i++) title = `Untitled Note ${i}`;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const id = `${slug}-${s.notes.length}`;
      const note: Note = { id, title, folder, kind: "note", links: [], content: `# ${title}\n\n` };
      const notes = [...s.notes, note];
      return {
        notes,
        ...derive(notes),
        selectedId: id,
        centerView: "article" as const,
        sidebarView: "notes" as const,
        editing: true,
        expanded: folder ? new Set([...s.expanded, folder]) : s.expanded,
      };
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

// Persist edited content + light UI state (debounced via microtask coalescing).
let persistQueued = false;
useVault.subscribe(() => {
  if (persistQueued) return;
  persistQueued = true;
  queueMicrotask(() => {
    persistQueued = false;
    const s = useVault.getState();
    const contents: Record<string, string> = {};
    const newNotes: Note[] = [];
    for (const n of s.notes) {
      if (!seedIds.has(n.id)) {
        newNotes.push(n);
      } else if (n.content !== undefined && n.content !== seedContents[n.id]) {
        contents[n.id] = n.content;
      }
    }
    const data: Persisted = {
      contents,
      newNotes,
      selectedId: s.selectedId,
      expanded: [...s.expanded],
      sidebarView: s.sidebarView,
      centerView: s.centerView,
      mapView: s.mapView,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full / unavailable — ignore */
    }
  });
});
