import { useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { useSketch, strokePath, type Stroke } from "../useSketch";
import { Trash } from "../icons";
import "./SketchView.css";

const COLORS = ["#1c1c1e", "#6d4bd0", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
const SIZES = [2, 4, 8];

export default function SketchView() {
  const strokes = useSketch((s) => s.strokes);
  const addStroke = useSketch((s) => s.addStroke);
  const removeStroke = useSketch((s) => s.removeStroke);
  const undo = useSketch((s) => s.undo);
  const clear = useSketch((s) => s.clear);
  const createNoteWith = useVault((s) => s.createNoteWith);
  const toast = useVault((s) => s.toast);

  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const currentRef = useRef<[number, number][]>([]);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(COLORS[1]);
  const [width, setWidth] = useState(4);
  const [current, setCurrent] = useState<[number, number][]>([]);

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const eraseAt = ([x, y]: [number, number]) => {
    for (const s of strokes) {
      if (s.pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 12 + s.width)) {
        removeStroke(s.id);
      }
    }
  };

  const onDown = (e: React.PointerEvent) => {
    drawing.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pt(e);
    if (tool === "eraser") eraseAt(p);
    else {
      currentRef.current = [p];
      setCurrent([p]);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pt(e);
    if (tool === "eraser") eraseAt(p);
    else {
      currentRef.current = [...currentRef.current, p];
      setCurrent(currentRef.current);
    }
  };
  const onUp = () => {
    drawing.current = false;
    if (tool === "pen" && currentRef.current.length > 1) {
      addStroke({ color, width, pts: currentRef.current });
    }
    currentRef.current = [];
    setCurrent([]);
  };

  const saveToNote = () => {
    if (!strokes.length) return toast("Draw something first");
    const all = [...strokes];
    // reduce, don't spread — Math.max(...bigArray) throws RangeError on a dense sketch
    let maxX = 0;
    let maxY = 0;
    for (const s of all)
      for (const [px, py] of s.pts) {
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    const w = maxX + 20;
    const h = maxY + 20;
    const paths = all
      .map((s) => `<path d="${strokePath(s.pts)}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`)
      .join("");
    const svg = `<svg viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">${paths}</svg>`;
    createNoteWith("Sketch", `# Sketch\n\n${svg}\n`, "Sketches");
    toast("Sketch saved to a note");
  };

  const render = (s: Stroke | { pts: [number, number][]; color: string; width: number }, key: string) => (
    <path
      key={key}
      d={strokePath(s.pts)}
      fill="none"
      stroke={s.color}
      strokeWidth={s.width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  return (
    <main className="sketch-view">
      <header className="sketch-toolbar">
        <div className="sketch-tools">
          <button className={"tool-btn" + (tool === "pen" ? " active" : "")} onClick={() => setTool("pen")}>
            ✏️ Pen
          </button>
          <button className={"tool-btn" + (tool === "eraser" ? " active" : "")} onClick={() => setTool("eraser")}>
            🧽 Eraser
          </button>
          <span className="sketch-sep" />
          {COLORS.map((c) => (
            <button
              key={c}
              className={"sketch-swatch" + (color === c && tool === "pen" ? " active" : "")}
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                setTool("pen");
              }}
            />
          ))}
          <span className="sketch-sep" />
          {SIZES.map((s) => (
            <button
              key={s}
              className={"size-btn" + (width === s ? " active" : "")}
              onClick={() => setWidth(s)}
            >
              <span style={{ width: s + 2, height: s + 2 }} />
            </button>
          ))}
        </div>
        <div className="sketch-actions">
          <button className="seg-btn" onClick={undo}>
            Undo
          </button>
          <button className="seg-btn" onClick={clear}>
            <Trash size={14} />
            Clear
          </button>
          <button className="seg-btn" onClick={saveToNote}>
            Save as note
          </button>
        </div>
      </header>

      <svg
        ref={svgRef}
        className={"sketch-canvas " + tool}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {strokes.map((s) => render(s, s.id))}
        {current.length > 1 && render({ pts: current, color, width }, "current")}
      </svg>
    </main>
  );
}
