import { useVault } from "../store/useVault";
import { windowControl } from "../tauri";
import { Sun, Moon, ChevronRight, PanelLeft, PanelRight } from "../icons";
import "./TitleBar.css";

export default function TitleBar() {
  const theme = useVault((s) => s.theme);
  const toggleTheme = useVault((s) => s.toggleTheme);
  const histIndex = useVault((s) => s.histIndex);
  const histLen = useVault((s) => s.history.length);
  const goBack = useVault((s) => s.goBack);
  const goForward = useVault((s) => s.goForward);
  const sidebarCollapsed = useVault((s) => s.sidebarCollapsed);
  const inspectorCollapsed = useVault((s) => s.inspectorCollapsed);
  const toggleSidebar = useVault((s) => s.toggleSidebar);
  const toggleInspector = useVault((s) => s.toggleInspector);
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="traffic">
        <button
          className="tl tl-red"
          aria-label="Close"
          onClick={() => windowControl("close")}
        />
        <button
          className="tl tl-yellow"
          aria-label="Minimize"
          onClick={() => windowControl("minimize")}
        />
        <button
          className="tl tl-green"
          aria-label="Maximize"
          onClick={() => windowControl("maximize")}
        />
      </div>
      <div className="titlebar-nav">
        <button
          className={"titlebar-btn" + (sidebarCollapsed ? " on" : "")}
          aria-label="Toggle sidebar"
          title="Toggle sidebar (Ctrl/Cmd+\\)"
          onClick={toggleSidebar}
        >
          <PanelLeft size={15} />
        </button>
        <button
          className="titlebar-btn"
          aria-label="Back"
          title="Back (Alt+←)"
          disabled={histIndex <= 0}
          onClick={goBack}
        >
          <ChevronRight size={15} style={{ transform: "rotate(180deg)" }} />
        </button>
        <button
          className="titlebar-btn"
          aria-label="Forward"
          title="Forward (Alt+→)"
          disabled={histIndex >= histLen - 1}
          onClick={goForward}
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="titlebar-spacer" />
      <button
        className="titlebar-btn"
        aria-label="Toggle theme"
        title="Toggle light / dark"
        onClick={toggleTheme}
      >
        {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
      </button>
      <button
        className={"titlebar-btn" + (inspectorCollapsed ? " on" : "")}
        aria-label="Toggle inspector"
        title="Toggle inspector (Ctrl/Cmd+Shift+\\)"
        onClick={toggleInspector}
      >
        <PanelRight size={15} />
      </button>
    </div>
  );
}
