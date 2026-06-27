import { create } from "zustand";
import { vault } from "../data/vault";
import type { Note } from "../data/vault";
import {
  buildTree,
  buildGraph,
  buildLinkMap,
  buildBacklinks,
  buildCiteMap,
  titleResolver,
  type TreeFolder,
  type Citation,
} from "../data/derive";
import { buildContents } from "../data/content";
import type { Resolver } from "../markdown";

export type SidebarView = "stats" | "notes" | "graph" | "search" | "table" | "tasks";
export type MapView = "links" | "sources";
export type CenterView = "graph" | "article" | "table" | "tasks" | "canvas";
export type Theme = "light" | "dark";

export interface MenuState {
  x: number;
  y: number;
  noteId: string;
}

export interface Pane {
  tabs: string[];
  active: string;
}

function withTab(panes: Pane[], paneIdx: number, id: string): Pane[] {
  return panes.map((p, i) =>
    i === paneIdx ? { tabs: p.tabs.includes(id) ? p.tabs : [...p.tabs, id], active: id } : p,
  );
}

interface Derived {
  tree: TreeFolder;
  graph: ReturnType<typeof buildGraph>;
  linkMap: Map<string, string[]>;
  backlinkMap: Map<string, string[]>;
  notesById: Map<string, Note>;
  citeMap: Map<string, Citation>;
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
    citeMap: buildCiteMap(notes),
    resolve,
  };
}

const seedContents = buildContents(vault);

const STORAGE_KEY = "inkwell.vault.v1";
interface Persisted {
  contents?: Record<string, string>;
  newNotes?: Note[];
  deleted?: string[];
  selectedId?: string;
  expanded?: string[];
  sidebarView?: SidebarView;
  centerView?: CenterView;
  mapView?: MapView;
  theme?: Theme;
  sidebarWidth?: number;
  inspectorWidth?: number;
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
const deletedSet = new Set(persisted.deleted ?? []);
const deletedIds = deletedSet;
const seedNotes: Note[] = [
  ...vault.notes.map((n) => ({
    ...n,
    content: persisted.contents?.[n.id] ?? seedContents[n.id],
  })),
  ...(persisted.newNotes ?? []).filter((n) => !seedIds.has(n.id)),
].filter((n) => !deletedIds.has(n.id));

interface VaultState extends Derived {
  vaultName: string;
  notes: Note[];
  selectedId: string;
  panes: Pane[];
  activePane: number;
  openInTab: (id: string) => void;
  splitWith: (id: string) => void;
  closeTab: (paneIdx: number, id: string) => void;
  setActivePane: (idx: number) => void;
  activateTab: (paneIdx: number, id: string) => void;
  expanded: Set<string>;
  sidebarView: SidebarView;
  mapView: MapView;
  centerView: CenterView;
  editing: boolean;
  fitNonce: number;
  graphLocal: boolean;
  graphColorFolder: boolean;
  toggleGraphLocal: () => void;
  toggleGraphColorFolder: () => void;
  theme: Theme;
  toggleTheme: () => void;
  sidebarWidth: number;
  inspectorWidth: number;
  setSidebarWidth: (w: number) => void;
  setInspectorWidth: (w: number) => void;
  menu: MenuState | null;
  openMenu: (x: number, y: number, noteId: string) => void;
  closeMenu: () => void;
  deleteNote: (id: string) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  openTag: (tag: string) => void;
  scrollTarget: string | null;
  scrollToHeading: (slug: string) => void;
  clearScrollTarget: () => void;
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
  panes: [
    {
      tabs: [persisted.selectedId ?? "convolutional-neural-networks"],
      active: persisted.selectedId ?? "convolutional-neural-networks",
    },
  ],
  activePane: 0,
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
  graphLocal: false,
  graphColorFolder: false,
  toggleGraphLocal: () => set((s) => ({ graphLocal: !s.graphLocal })),
  toggleGraphColorFolder: () => set((s) => ({ graphColorFolder: !s.graphColorFolder })),
  theme: persisted.theme ?? "light",
  toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
  sidebarWidth: persisted.sidebarWidth ?? 256,
  inspectorWidth: persisted.inspectorWidth ?? 296,
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(200, Math.min(420, w)) }),
  setInspectorWidth: (w) => set({ inspectorWidth: Math.max(240, Math.min(460, w)) }),
  menu: null,
  openMenu: (x, y, noteId) => set({ menu: { x, y, noteId } }),
  closeMenu: () => set({ menu: null }),
  deleteNote: (id) =>
    set((s) => {
      deletedSet.add(id);
      const notes = s.notes.filter((n) => n.id !== id);
      const fallback = notes[0]?.id ?? "";
      let panes = s.panes
        .map((p) => {
          const tabs = p.tabs.filter((t) => t !== id);
          return {
            tabs,
            active: tabs.includes(p.active) ? p.active : tabs[tabs.length - 1] ?? fallback,
          };
        })
        .filter((p, i) => i === 0 || p.tabs.length > 0);
      if (!panes.length) panes = [{ tabs: fallback ? [fallback] : [], active: fallback }];
      const activePane = Math.min(s.activePane, panes.length - 1);
      return {
        notes,
        ...derive(notes),
        panes,
        activePane,
        selectedId: panes[activePane]?.active ?? fallback,
        menu: null,
      };
    }),
  paletteOpen: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  openTag: (tag) => set({ searchQuery: `#${tag}`, sidebarView: "search" }),
  scrollTarget: null,
  scrollToHeading: (slug) => set({ centerView: "article", editing: false, scrollTarget: slug }),
  clearScrollTarget: () => set({ scrollTarget: null }),
  select: (id) => set({ selectedId: id }),
  openArticle: (id) =>
    set((s) => ({
      panes: withTab(s.panes, s.activePane, id),
      selectedId: id,
      centerView: "article",
      sidebarView: "notes",
    })),
  openInTab: (id) =>
    set((s) => ({
      panes: withTab(s.panes, s.activePane, id),
      selectedId: id,
      centerView: "article",
      sidebarView: "notes",
    })),
  splitWith: (id) =>
    set((s) => {
      const panes: Pane[] = [s.panes[0], { tabs: [id], active: id }];
      return { panes, activePane: 1, selectedId: id, centerView: "article", sidebarView: "notes" };
    }),
  closeTab: (paneIdx, id) =>
    set((s) => {
      let panes = s.panes.map((p, i) =>
        i !== paneIdx ? p : { ...p, tabs: p.tabs.filter((t) => t !== id) },
      );
      panes = panes.map((p, i) =>
        i !== paneIdx
          ? p
          : { ...p, active: p.tabs.includes(p.active) ? p.active : p.tabs[p.tabs.length - 1] ?? "" },
      );
      let activePane = s.activePane;
      if (panes.length > 1 && panes[paneIdx].tabs.length === 0) {
        panes = panes.filter((_, i) => i !== paneIdx);
        activePane = 0;
      }
      activePane = Math.min(activePane, panes.length - 1);
      return { panes, activePane, selectedId: panes[activePane]?.active ?? "" };
    }),
  setActivePane: (idx) =>
    set((s) => ({ activePane: idx, selectedId: s.panes[idx]?.active ?? s.selectedId })),
  activateTab: (paneIdx, id) =>
    set((s) => ({
      panes: s.panes.map((p, i) => (i === paneIdx ? { ...p, active: id } : p)),
      activePane: paneIdx,
      selectedId: id,
    })),
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
      if (v === "table") return { sidebarView: v, centerView: "table" as const };
      if (v === "tasks") return { sidebarView: v, centerView: "tasks" as const };
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
        panes: withTab(s.panes, s.activePane, id),
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
      deleted: [...deletedSet],
      selectedId: s.selectedId,
      expanded: [...s.expanded],
      sidebarView: s.sidebarView,
      centerView: s.centerView,
      mapView: s.mapView,
      theme: s.theme,
      sidebarWidth: s.sidebarWidth,
      inspectorWidth: s.inspectorWidth,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full / unavailable — ignore */
    }
  });
});
