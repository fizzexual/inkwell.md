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
import ImportModal from "./components/ImportModal";
import HistoryModal from "./components/HistoryModal";
import SemanticSearch from "./components/SemanticSearch";
import TranscribeModal from "./components/TranscribeModal";

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
import { appShortcut } from "./keys";
import "./App.css";

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
      const s = useVault.getState();
      const action = appShortcut(e, s);
      if (!action) return;
      // a plain Esc that leaves edit / goes to the map keeps its default (as before)
      if (action !== "stopEditing" && action !== "toMap") e.preventDefault();
      switch (action) {
        case "exitZen":
        case "toggleZen":
          return s.toggleZen();
        case "togglePalette":
          return setPaletteOpen(!s.paletteOpen);
        case "toggleQuick":
          return s.setQuickOpen(!s.quickOpen);
        case "newNote":
          return s.createNote();
        case "toggleEdit":
          if (s.centerView !== "article") s.setCenterView("article");
          return s.setEditing(!s.editing);
        case "graph":
        case "toMap":
          return s.setCenterView("graph");
        case "back":
          return s.goBack();
        case "forward":
          return s.goForward();
        case "toggleInspector":
          return s.toggleInspector();
        case "toggleSidebar":
          return s.toggleSidebar();
        case "toggleAi":
          return s.toggleAi();
        case "semantic":
          return s.openSemantic();
        case "undo":
          return s.undo();
        case "redo":
          return s.redo();
        case "shortcuts":
          return s.setShortcutsOpen(true);
        case "stopEditing":
          return s.setEditing(false);
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
      <ImportModal />
      <HistoryModal />
      <SemanticSearch />
      <TranscribeModal />
      {constellationOpen && <ConstellationView />}
      <Onboarding />
      <Toaster />
    </div>
  );
}
