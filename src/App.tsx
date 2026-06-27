import { useEffect } from "react";
import { useVault } from "./store/useVault";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import KnowledgeMap from "./components/KnowledgeMap";
import ArticleView from "./components/ArticleView";
import TableView from "./components/TableView";
import Inspector from "./components/Inspector";
import CommandPalette from "./components/CommandPalette";
import Resizer from "./components/Resizer";
import "./App.css";

export default function App() {
  const centerView = useVault((s) => s.centerView);
  const setPaletteOpen = useVault((s) => s.setPaletteOpen);
  const theme = useVault((s) => s.theme);
  const setSidebarWidth = useVault((s) => s.setSidebarWidth);
  const setInspectorWidth = useVault((s) => s.setInspectorWidth);

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
        <Sidebar />
        <Resizer
          dir={1}
          getStart={() => useVault.getState().sidebarWidth}
          onChange={setSidebarWidth}
        />
        {centerView === "graph" ? (
          <KnowledgeMap />
        ) : centerView === "table" ? (
          <TableView />
        ) : (
          <ArticleView />
        )}
        <Resizer
          dir={-1}
          getStart={() => useVault.getState().inspectorWidth}
          onChange={setInspectorWidth}
        />
        <Inspector />
      </div>
      <CommandPalette />
    </div>
  );
}
