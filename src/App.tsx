import { useEffect } from "react";
import { useVault } from "./store/useVault";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import KnowledgeMap from "./components/KnowledgeMap";
import ArticleView from "./components/ArticleView";
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
      if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "k")) {
        e.preventDefault();
        setPaletteOpen(!useVault.getState().paletteOpen);
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
        {centerView === "graph" ? <KnowledgeMap /> : <ArticleView />}
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
