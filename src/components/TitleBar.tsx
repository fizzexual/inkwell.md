import { windowControl } from "../tauri";
import "./TitleBar.css";

export default function TitleBar() {
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
    </div>
  );
}
