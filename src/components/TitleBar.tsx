import { useVault } from "../store/useVault";
import { windowControl } from "../tauri";
import { Sun, Moon } from "../icons";
import "./TitleBar.css";

export default function TitleBar() {
  const theme = useVault((s) => s.theme);
  const toggleTheme = useVault((s) => s.toggleTheme);
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
      <div className="titlebar-spacer" />
      <button
        className="titlebar-btn"
        aria-label="Toggle theme"
        title="Toggle light / dark"
        onClick={toggleTheme}
      >
        {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
      </button>
    </div>
  );
}
