import { useEffect, lazy, Suspense } from "react";
import { useVault } from "./store/useVault";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import KnowledgeMap from "./components/KnowledgeMap";
import NotesWorkspace from "./components/NotesWorkspace";
import TableView from "./components/TableView";
import TasksView from "./components/TasksView";
import CanvasView from "./components/CanvasView";
import MathEngineView from "./components/MathEngineView";
import DailyView from "./components/DailyView";
import KanbanView from "./components/KanbanView";
import CardsView from "./components/CardsView";
import SketchView from "./components/SketchView";
import WhiteboardView from "./components/WhiteboardView";
import ConstellationView from "./components/ConstellationView";
import Inspector from "./components/Inspector";
import AiPanel from "./components/AiPanel";
import KeyManager from "./components/KeyManager";
import Onboarding from "./components/Onboarding";

// pdf.js is heavy — only load the reader when it's actually opened
const PdfView = lazy(() => import("./components/PdfView"));
import CommandPalette from "./components/CommandPalette";
import QuickCapture from "./components/QuickCapture";
import WebClipper from "./components/WebClipper";
import ContextMenu from "./components/ContextMenu";
import Picker from "./components/Picker";
import Toaster from "./components/Toaster";
import ShortcutsModal from "./components/ShortcutsModal";
import Resizer from "./components/Resizer";
import "./App.css";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    el?.isContentEditable === true ||
    !!el?.closest?.(".bld-input")
  );
}

export default function App() {
  const centerView = useVault((s) => s.centerView);
  const setPaletteOpen = useVault((s) => s.setPaletteOpen);
  const theme = useVault((s) => s.theme);
  const setSidebarWidth = useVault((s) => s.setSidebarWidth);
  const setInspectorWidth = useVault((s) => s.setInspectorWidth);
  const sidebarCollapsed = useVault((s) => s.sidebarCollapsed);
  const inspectorCollapsed = useVault((s) => s.inspectorCollapsed);
  const aiOpen = useVault((s) => s.aiOpen);
  const constellationOpen = useVault((s) => s.constellationOpen);
  const accent = useVault((s) => s.accent);
  const zen = useVault((s) => s.zen);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (accent) {
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--accent-weak", `color-mix(in srgb, ${accent} 15%, transparent)`);
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-weak");
    }
  }, [accent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const s = useVault.getState();
      if (e.key === "Escape" && s.zen) {
        e.preventDefault();
        s.toggleZen();
        return;
      }
      if (mod && e.key === ".") {
        e.preventDefault();
        s.toggleZen();
      } else if (mod && !e.shiftKey && (e.key === "p" || e.key === "k")) {
        e.preventDefault();
        setPaletteOpen(!s.paletteOpen);
      } else if (mod && e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        s.setQuickOpen(!s.quickOpen);
      } else if (mod && e.key === "n") {
        e.preventDefault();
        s.createNote();
      } else if (mod && e.key === "e") {
        e.preventDefault();
        if (s.centerView !== "article") s.setCenterView("article");
        s.setEditing(!s.editing);
      } else if (mod && e.key === "g") {
        e.preventDefault();
        s.setCenterView("graph");
      } else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        s.goBack();
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        s.goForward();
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        if (e.shiftKey) s.toggleInspector();
        else s.toggleSidebar();
      } else if (mod && e.key === "j") {
        e.preventDefault();
        s.toggleAi();
      } else if (mod && (e.key === "z" || e.key === "Z")) {
        // let native undo win inside other text fields (math sheet, search…)
        const t = e.target as HTMLElement | null;
        if (isTyping(t) && !t?.classList.contains("md-editor")) return;
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key === "y") {
        e.preventDefault();
        s.redo();
      } else if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        s.setShortcutsOpen(true);
      } else if (e.key === "Escape" && !s.paletteOpen) {
        if (s.editing) s.setEditing(false);
        else if (s.centerView === "article") s.setCenterView("graph");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  return (
    <div className={"app" + (zen ? " zen" : "")}>
      {zen && (
        <button className="zen-exit" title="Exit focus mode (Esc)" onClick={() => useVault.getState().toggleZen()}>
          Exit focus
        </button>
      )}
      <TitleBar />
      <div className="app-body">
        {!sidebarCollapsed && (
          <>
            <Sidebar />
            <Resizer
              dir={1}
              getStart={() => useVault.getState().sidebarWidth}
              onChange={setSidebarWidth}
            />
          </>
        )}
        {centerView === "graph" ? (
          <KnowledgeMap />
        ) : centerView === "table" ? (
          <TableView />
        ) : centerView === "tasks" ? (
          <TasksView />
        ) : centerView === "canvas" ? (
          <CanvasView />
        ) : centerView === "math" ? (
          <MathEngineView />
        ) : centerView === "daily" ? (
          <DailyView />
        ) : centerView === "kanban" ? (
          <KanbanView />
        ) : centerView === "cards" ? (
          <CardsView />
        ) : centerView === "sketch" ? (
          <SketchView />
        ) : centerView === "board" ? (
          <WhiteboardView />
        ) : centerView === "pdf" ? (
          <Suspense fallback={<div className="lazy-fallback">Loading reader…</div>}>
            <PdfView />
          </Suspense>
        ) : (
          <NotesWorkspace />
        )}
        {/* right panel: the assistant and the inspector share one slot so the note area is never squeezed */}
        {aiOpen ? (
          <AiPanel />
        ) : (
          !inspectorCollapsed && (
            <>
              <Resizer
                dir={-1}
                getStart={() => useVault.getState().inspectorWidth}
                onChange={setInspectorWidth}
              />
              <Inspector />
            </>
          )
        )}
      </div>
      <CommandPalette />
      <QuickCapture />
      <WebClipper />
      <ContextMenu />
      <Picker />
      <ShortcutsModal />
      <KeyManager />
      {constellationOpen && <ConstellationView />}
      <Onboarding />
      <Toaster />
    </div>
  );
}
