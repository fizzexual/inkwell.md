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
import Inspector from "./components/Inspector";

// pdf.js is heavy — only load the reader when it's actually opened
const PdfView = lazy(() => import("./components/PdfView"));
import CommandPalette from "./components/CommandPalette";
import ContextMenu from "./components/ContextMenu";
import Toaster from "./components/Toaster";
import ShortcutsModal from "./components/ShortcutsModal";
import Resizer from "./components/Resizer";
import "./App.css";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable === true;
}

export default function App() {
  const centerView = useVault((s) => s.centerView);
  const setPaletteOpen = useVault((s) => s.setPaletteOpen);
  const theme = useVault((s) => s.theme);
  const setSidebarWidth = useVault((s) => s.setSidebarWidth);
  const setInspectorWidth = useVault((s) => s.setInspectorWidth);
  const sidebarCollapsed = useVault((s) => s.sidebarCollapsed);
  const inspectorCollapsed = useVault((s) => s.inspectorCollapsed);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const s = useVault.getState();
      if (mod && (e.key === "p" || e.key === "k")) {
        e.preventDefault();
        setPaletteOpen(!s.paletteOpen);
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
    <div className="app">
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
        ) : centerView === "pdf" ? (
          <Suspense fallback={<div className="lazy-fallback">Loading reader…</div>}>
            <PdfView />
          </Suspense>
        ) : (
          <NotesWorkspace />
        )}
        {!inspectorCollapsed && (
          <>
            <Resizer
              dir={-1}
              getStart={() => useVault.getState().inspectorWidth}
              onChange={setInspectorWidth}
            />
            <Inspector />
          </>
        )}
      </div>
      <CommandPalette />
      <ContextMenu />
      <ShortcutsModal />
      <Toaster />
    </div>
  );
}
