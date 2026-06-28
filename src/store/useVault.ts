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
import { setFrontmatterField, type Resolver } from "../markdown";

export type SidebarView =
  | "stats"
  | "notes"
  | "graph"
  | "search"
  | "table"
  | "tasks"
  | "canvas"
  | "math"
  | "daily"
  | "kanban"
  | "cards";
export type MapView = "links" | "sources";
export type CenterView =
  | "graph"
  | "article"
  | "table"
  | "tasks"
  | "canvas"
  | "pdf"
  | "math"
  | "daily"
  | "kanban"
  | "cards";

export interface PdfDoc {
  name: string;
  data: ArrayBuffer;
}
export type Theme = "light" | "dark";

export interface MenuState {
  x: number;
  y: number;
  noteId: string;
}

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}
let toastSeq = 0;

export interface Pane {
  tabs: string[];
  active: string;
}

export interface CanvasCard {
  id: string;
  x: number;
  y: number;
}
export interface CanvasState {
  cards: CanvasCard[];
  tx: number;
  ty: number;
  scale: number;
}

const defaultCanvas: CanvasState = {
  tx: 40,
  ty: 30,
  scale: 1,
  cards: [
    { id: "deep-learning-moc", x: 360, y: 40 },
    { id: "foundations-moc", x: 70, y: 230 },
    { id: "nn-fundamentals-moc", x: 360, y: 250 },
    { id: "architectures-moc", x: 660, y: 230 },
    { id: "welcome", x: 560, y: 440 },
    { id: "transformer", x: 800, y: 430 },
  ],
};

function withTab(panes: Pane[], paneIdx: number, id: string): Pane[] {
  return panes.map((p, i) =>
    i === paneIdx ? { tabs: p.tabs.includes(id) ? p.tabs : [...p.tabs, id], active: id } : p,
  );
}

function openInPane(panes: Pane[], activePane: number, id: string) {
  return {
    panes: withTab(panes, activePane, id),
    selectedId: id,
    centerView: "article" as const,
    sidebarView: "notes" as const,
  };
}

interface Snapshot {
  notes: Note[];
  selectedId: string;
  panes: Pane[];
  activePane: number;
}
const UNDO_LIMIT = 150;
let undoMeta = { kind: "", id: "", time: 0 };

function snap(s: {
  notes: Note[];
  selectedId: string;
  panes: Pane[];
  activePane: number;
}): Snapshot {
  return { notes: s.notes, selectedId: s.selectedId, panes: s.panes, activePane: s.activePane };
}

/** History fields for a discrete (non-typing) note mutation. */
function pushHist(s: { undoStack: Snapshot[]; notes: Note[]; selectedId: string; panes: Pane[]; activePane: number }) {
  undoMeta = { kind: "", id: "", time: 0 };
  return { undoStack: [...s.undoStack, snap(s)].slice(-UNDO_LIMIT), redoStack: [] as Snapshot[] };
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

const STORAGE_KEY = "inkwell.vault.v2";
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
  canvas?: CanvasState;
  pinned?: string[];
  sidebarCollapsed?: boolean;
  inspectorCollapsed?: boolean;
  folderColors?: Record<string, string>;
  noteIcons?: Record<string, string>;
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
  history: string[];
  histIndex: number;
  goBack: () => void;
  goForward: () => void;
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
  graphFilter: string;
  graphReveal: number | null;
  setGraphFilter: (q: string) => void;
  setGraphReveal: (n: number | null) => void;
  theme: Theme;
  toggleTheme: () => void;
  sidebarWidth: number;
  inspectorWidth: number;
  setSidebarWidth: (w: number) => void;
  setInspectorWidth: (w: number) => void;
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  toggleSidebar: () => void;
  toggleInspector: () => void;
  menu: MenuState | null;
  openMenu: (x: number, y: number, noteId: string) => void;
  closeMenu: () => void;
  picker: { x: number; y: number; kind: "icon" | "color"; target: string } | null;
  openPicker: (x: number, y: number, kind: "icon" | "color", target: string) => void;
  closePicker: () => void;
  folderColors: Record<string, string>;
  noteIcons: Record<string, string>;
  setFolderColor: (path: string, color: string | null) => void;
  setNoteIcon: (id: string, icon: string | null) => void;
  deleteNote: (id: string) => void;
  restoreNote: (note: Note) => void;
  toasts: Toast[];
  toast: (message: string, action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;
  pinned: string[];
  togglePin: (id: string) => void;
  canvas: CanvasState;
  addToCanvas: (id: string) => void;
  removeFromCanvas: (id: string) => void;
  moveCanvasCard: (id: string, x: number, y: number) => void;
  setCanvasTransform: (tx: number, ty: number, scale: number) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;
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
  setProperty: (id: string, key: string, value: string) => void;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  undo: () => void;
  redo: () => void;
  createNote: (folder?: string) => void;
  createNoteWith: (title: string, content: string, folder?: string) => void;
  pdf: PdfDoc | null;
  openPdf: (name: string, data: ArrayBuffer) => void;
  openDailyNote: (dateStr: string) => void;
  requestFit: () => void;
  linksOf: (id: string) => Note[];
  backlinksOf: (id: string) => Note[];
}

export const useVault = create<VaultState>((set, get) => ({
  vaultName: vault.name,
  notes: seedNotes,
  ...derive(seedNotes),
  selectedId: persisted.selectedId ?? "welcome",
  panes: [
    {
      tabs: [persisted.selectedId ?? "welcome"],
      active: persisted.selectedId ?? "welcome",
    },
  ],
  activePane: 0,
  expanded: new Set(
    persisted.expanded ?? ["00 - Start Here", "01 - Writing", "03 - Views"],
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
  graphFilter: "",
  graphReveal: null,
  setGraphFilter: (q) => set({ graphFilter: q }),
  setGraphReveal: (n) => set({ graphReveal: n }),
  theme: persisted.theme ?? "light",
  toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
  sidebarWidth: persisted.sidebarWidth ?? 256,
  inspectorWidth: persisted.inspectorWidth ?? 296,
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(200, Math.min(420, w)) }),
  setInspectorWidth: (w) => set({ inspectorWidth: Math.max(240, Math.min(460, w)) }),
  sidebarCollapsed: persisted.sidebarCollapsed ?? false,
  inspectorCollapsed: persisted.inspectorCollapsed ?? false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleInspector: () => set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
  menu: null,
  openMenu: (x, y, noteId) => set({ menu: { x, y, noteId } }),
  closeMenu: () => set({ menu: null }),
  picker: null,
  openPicker: (x, y, kind, target) => set({ picker: { x, y, kind, target }, menu: null }),
  closePicker: () => set({ picker: null }),
  folderColors: persisted.folderColors ?? {},
  noteIcons: persisted.noteIcons ?? {},
  setFolderColor: (path, color) =>
    set((s) => {
      const folderColors = { ...s.folderColors };
      if (color) folderColors[path] = color;
      else delete folderColors[path];
      return { folderColors, picker: null };
    }),
  setNoteIcon: (id, icon) =>
    set((s) => {
      const noteIcons = { ...s.noteIcons };
      if (icon) noteIcons[id] = icon;
      else delete noteIcons[id];
      return { noteIcons, picker: null };
    }),
  toasts: [],
  toast: (message, action) =>
    set((s) => ({ toasts: [...s.toasts, { id: ++toastSeq, message, action }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  pinned: persisted.pinned ?? [],
  togglePin: (id) =>
    set((s) => ({
      pinned: s.pinned.includes(id) ? s.pinned.filter((p) => p !== id) : [...s.pinned, id],
    })),
  canvas: persisted.canvas ?? defaultCanvas,
  addToCanvas: (id) =>
    set((s) => {
      if (s.canvas.cards.some((c) => c.id === id)) return { centerView: "canvas" as const };
      const x = (260 - s.canvas.tx) / s.canvas.scale + Math.random() * 60;
      const y = (180 - s.canvas.ty) / s.canvas.scale + Math.random() * 60;
      return {
        canvas: { ...s.canvas, cards: [...s.canvas.cards, { id, x, y }] },
        centerView: "canvas" as const,
      };
    }),
  removeFromCanvas: (id) =>
    set((s) => ({ canvas: { ...s.canvas, cards: s.canvas.cards.filter((c) => c.id !== id) } })),
  moveCanvasCard: (id, x, y) =>
    set((s) => ({
      canvas: { ...s.canvas, cards: s.canvas.cards.map((c) => (c.id === id ? { ...c, x, y } : c)) },
    })),
  setCanvasTransform: (tx, ty, scale) =>
    set((s) => ({ canvas: { ...s.canvas, tx, ty, scale } })),
  deleteNote: (id) => {
    const removed = get().notes.find((n) => n.id === id);
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
      const hist = pushHist(s);
      return {
        notes,
        ...derive(notes),
        panes,
        activePane,
        selectedId: panes[activePane]?.active ?? fallback,
        menu: null,
        ...hist,
        toasts: removed
          ? [
              ...s.toasts,
              {
                id: ++toastSeq,
                message: `Deleted “${removed.title}”`,
                action: { label: "Undo", run: () => get().restoreNote(removed) },
              },
            ]
          : s.toasts,
      };
    });
  },
  restoreNote: (note) =>
    set((s) => {
      deletedSet.delete(note.id);
      const notes = [...s.notes, note];
      return {
        notes,
        ...derive(notes),
        selectedId: note.id,
        panes: withTab(s.panes, s.activePane, note.id),
        centerView: "article" as const,
        sidebarView: "notes" as const,
        ...pushHist(s),
      };
    }),
  paletteOpen: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  shortcutsOpen: false,
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  openTag: (tag) => set({ searchQuery: `#${tag}`, sidebarView: "search" }),
  scrollTarget: null,
  scrollToHeading: (slug) => set({ centerView: "article", editing: false, scrollTarget: slug }),
  clearScrollTarget: () => set({ scrollTarget: null }),
  select: (id) => set({ selectedId: id }),
  openArticle: (id) =>
    set((s) => {
      const base = openInPane(s.panes, s.activePane, id);
      if (s.history[s.histIndex] === id) return base;
      const history = [...s.history.slice(0, s.histIndex + 1), id];
      return { ...base, history, histIndex: history.length - 1 };
    }),
  openInTab: (id) =>
    set((s) => {
      const base = openInPane(s.panes, s.activePane, id);
      const history = [...s.history.slice(0, s.histIndex + 1), id];
      return { ...base, history, histIndex: history.length - 1 };
    }),
  history: [persisted.selectedId ?? "welcome"],
  histIndex: 0,
  goBack: () =>
    set((s) => {
      if (s.histIndex <= 0) return {};
      const i = s.histIndex - 1;
      return { ...openInPane(s.panes, s.activePane, s.history[i]), histIndex: i };
    }),
  goForward: () =>
    set((s) => {
      if (s.histIndex >= s.history.length - 1) return {};
      const i = s.histIndex + 1;
      return { ...openInPane(s.panes, s.activePane, s.history[i]), histIndex: i };
    }),
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
      if (v === "canvas") return { sidebarView: v, centerView: "canvas" as const };
      if (v === "math") return { sidebarView: v, centerView: "math" as const };
      if (v === "daily") return { sidebarView: v, centerView: "daily" as const };
      if (v === "kanban") return { sidebarView: v, centerView: "kanban" as const };
      if (v === "cards") return { sidebarView: v, centerView: "cards" as const };
      return { sidebarView: v };
    }),
  setMapView: (v) => set({ mapView: v }),
  setCenterView: (v) => set({ centerView: v }),
  setEditing: (v) => set({ editing: v }),
  updateContent: (id, md) =>
    set((s) => {
      // coalesce a burst of typing on one note into a single undo step
      const now = Date.now();
      const coalesce = undoMeta.kind === "edit" && undoMeta.id === id && now - undoMeta.time < 900;
      undoMeta = { kind: "edit", id, time: now };
      const undoStack = coalesce ? s.undoStack : [...s.undoStack, snap(s)].slice(-UNDO_LIMIT);
      const heading = md.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
      const notes = s.notes.map((n) =>
        n.id === id ? { ...n, content: md, title: heading || n.title } : n,
      );
      return { notes, ...derive(notes), undoStack, redoStack: [] };
    }),
  undoStack: [],
  redoStack: [],
  undo: () =>
    set((s) => {
      if (!s.undoStack.length) return {};
      const prev = s.undoStack[s.undoStack.length - 1];
      undoMeta = { kind: "", id: "", time: 0 };
      return {
        ...prev,
        ...derive(prev.notes),
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, snap(s)].slice(-UNDO_LIMIT),
      };
    }),
  redo: () =>
    set((s) => {
      if (!s.redoStack.length) return {};
      const next = s.redoStack[s.redoStack.length - 1];
      undoMeta = { kind: "", id: "", time: 0 };
      return {
        ...next,
        ...derive(next.notes),
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snap(s)].slice(-UNDO_LIMIT),
      };
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
        ...pushHist(s),
      };
    }),
  setProperty: (id, key, value) =>
    set((s) => {
      const note = s.notes.find((n) => n.id === id);
      if (!note) return {};
      const content = setFrontmatterField(note.content ?? "", key, value);
      const notes = s.notes.map((n) => (n.id === id ? { ...n, content } : n));
      return { notes, ...derive(notes), ...pushHist(s) };
    }),
  createNoteWith: (title, content, folder = "") =>
    set((s) => {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const id = `${slug || "note"}-${s.notes.length}`;
      const note: Note = { id, title, folder, kind: "note", links: [], content };
      const notes = [...s.notes, note];
      return {
        notes,
        ...derive(notes),
        selectedId: id,
        panes: withTab(s.panes, s.activePane, id),
        centerView: "article" as const,
        sidebarView: "notes" as const,
        editing: false,
        expanded: folder ? new Set([...s.expanded, folder]) : s.expanded,
        ...pushHist(s),
      };
    }),
  pdf: null,
  openPdf: (name, data) => set({ pdf: { name, data }, centerView: "pdf" }),
  openDailyNote: (dateStr) => {
    const s = get();
    const existing = s.notes.find((nn) => nn.folder === "Daily" && nn.title === dateStr);
    if (existing) {
      s.openArticle(existing.id);
      return;
    }
    s.createNoteWith(
      dateStr,
      `# ${dateStr}\n\n## Plan\n\n- [ ] \n\n## Log\n\n## Notes\n`,
      "Daily",
    );
  },
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
      canvas: s.canvas,
      pinned: s.pinned,
      sidebarCollapsed: s.sidebarCollapsed,
      inspectorCollapsed: s.inspectorCollapsed,
      folderColors: s.folderColors,
      noteIcons: s.noteIcons,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full / unavailable — ignore */
    }
  });
});
