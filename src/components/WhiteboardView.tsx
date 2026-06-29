import { useRef, useState } from "react";
import { useBoard, strokePath, type Pt, type BoardNote } from "../board/useBoard";
import { useVault } from "../store/useVault";
import { Hand, Pencil, Eraser, StickyNote, Plus, Minus, Trash } from "../icons";
import "./WhiteboardView.css";

type Tool = "hand" | "pen" | "eraser" | "note";
const COLORS = ["#1c1c1e", "#6d4bd0", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
const NOTE_COLORS = ["#fff4bf", "#d7f0ff", "#e4ffd6", "#ffe0e6", "#ece4ff", "#ffffff"];
const SIZES = [2, 4, 8];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const capture = (el: Element | null, id: number) => {
  try {
    (el as Element & { setPointerCapture(id: number): void })?.setPointerCapture(id);
  } catch {
    /* pointer not active (synthetic / already released) — ignore */
  }
};

export default function WhiteboardView() {
  const camera = useBoard((s) => s.camera);
  const strokes = useBoard((s) => s.strokes);
  const notes = useBoard((s) => s.notes);
  const setCamera = useBoard((s) => s.setCamera);
  const addStroke = useBoard((s) => s.addStroke);
  const eraseAt = useBoard((s) => s.eraseAt);
  const addNote = useBoard((s) => s.addNote);
  const clear = useBoard((s) => s.clear);
  const toast = useVault((s) => s.toast);

  const rootRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[1]);
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const [width, setWidth] = useState(4);
  const [current, setCurrent] = useState<Pt[]>([]);

  const drawing = useRef(false);
  const panning = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const curRef = useRef<Pt[]>([]);

  const toWorld = (clientX: number, clientY: number): Pt => {
    const r = rootRef.current!.getBoundingClientRect();
    return [(clientX - r.left - camera.x) / camera.scale, (clientY - r.top - camera.y) / camera.scale];
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 1 || tool === "hand" || (tool !== "note" && e.button === 2)) {
      panning.current = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y };
      capture(rootRef.current, e.pointerId);
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    if (tool === "pen") {
      drawing.current = true;
      curRef.current = [p];
      setCurrent([p]);
      capture(rootRef.current, e.pointerId);
    } else if (tool === "eraser") {
      drawing.current = true;
      eraseAt(p[0], p[1], 10 / camera.scale);
      capture(rootRef.current, e.pointerId);
    } else if (tool === "note") {
      const id = addNote(p[0], p[1], noteColor);
      requestAnimationFrame(() => document.getElementById(`bn-${id}`)?.focus());
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (panning.current) {
      setCamera({
        ...camera,
        x: panning.current.cx + (e.clientX - panning.current.x),
        y: panning.current.cy + (e.clientY - panning.current.y),
      });
      return;
    }
    if (!drawing.current) return;
    const p = toWorld(e.clientX, e.clientY);
    if (tool === "pen") {
      curRef.current = [...curRef.current, p];
      setCurrent(curRef.current);
    } else if (tool === "eraser") {
      eraseAt(p[0], p[1], 10 / camera.scale);
    }
  };

  const onUp = () => {
    if (panning.current) panning.current = null;
    if (drawing.current && tool === "pen" && curRef.current.length > 1) {
      addStroke({ color, width, pts: curRef.current });
    }
    drawing.current = false;
    curRef.current = [];
    setCurrent([]);
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = rootRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = clamp(camera.scale * factor, 0.2, 5);
    const wx = (sx - camera.x) / camera.scale;
    const wy = (sy - camera.y) / camera.scale;
    setCamera({ scale, x: sx - wx * scale, y: sy - wy * scale });
  };

  const zoomBy = (factor: number) => {
    const r = rootRef.current!.getBoundingClientRect();
    const sx = r.width / 2;
    const sy = r.height / 2;
    const scale = clamp(camera.scale * factor, 0.2, 5);
    const wx = (sx - camera.x) / camera.scale;
    const wy = (sy - camera.y) / camera.scale;
    setCamera({ scale, x: sx - wx * scale, y: sy - wy * scale });
  };

  return (
    <main className="board-view">
      <header className="board-toolbar">
        <div className="board-tools">
          {([
            ["hand", Hand, "Pan"],
            ["pen", Pencil, "Draw"],
            ["eraser", Eraser, "Erase"],
            ["note", StickyNote, "Sticky note"],
          ] as const).map(([t, Icon, label]) => (
            <button
              key={t}
              className={"tool-btn" + (tool === t ? " active" : "")}
              title={label}
              onClick={() => setTool(t)}
            >
              <Icon size={15} />
            </button>
          ))}
          <span className="board-sep" />
          {(tool === "note" ? NOTE_COLORS : COLORS).map((c) => (
            <button
              key={c}
              className={"board-swatch" + ((tool === "note" ? noteColor : color) === c ? " active" : "")}
              style={{ background: c }}
              onClick={() => (tool === "note" ? setNoteColor(c) : (setColor(c), setTool("pen")))}
            />
          ))}
          {tool !== "note" && <span className="board-sep" />}
          {tool !== "note" &&
            SIZES.map((s) => (
              <button
                key={s}
                className={"size-btn" + (width === s ? " active" : "")}
                onClick={() => setWidth(s)}
              >
                <span style={{ width: s + 2, height: s + 2 }} />
              </button>
            ))}
        </div>
        <div className="board-actions">
          <button className="seg-btn" onClick={() => zoomBy(1 / 1.2)} title="Zoom out">
            <Minus size={14} />
          </button>
          <button className="seg-btn zoom" onClick={() => setCamera({ x: 0, y: 0, scale: 1 })} title="Reset view">
            {Math.round(camera.scale * 100)}%
          </button>
          <button className="seg-btn" onClick={() => zoomBy(1.2)} title="Zoom in">
            <Plus size={14} />
          </button>
          <button
            className="seg-btn"
            onClick={() => {
              if (strokes.length || notes.length) {
                clear();
                toast("Whiteboard cleared");
              }
            }}
            title="Clear board"
          >
            <Trash size={14} />
          </button>
        </div>
      </header>

      <div
        ref={rootRef}
        className={"board-canvas tool-" + tool}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          backgroundSize: `${24 * camera.scale}px ${24 * camera.scale}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
      >
        <div
          className="board-world"
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}
        >
          <svg className="board-strokes" width="1" height="1">
            {strokes.map((s) => (
              <path
                key={s.id}
                d={strokePath(s.pts)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {current.length > 1 && (
              <path
                d={strokePath(current)}
                fill="none"
                stroke={color}
                strokeWidth={width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          {notes.map((n) => (
            <StickyNoteEl key={n.id} note={n} scale={camera.scale} />
          ))}
        </div>

        {strokes.length === 0 && notes.length === 0 && (
          <div className="board-hint">
            Draw freely · drag to pan with the hand · scroll to zoom · drop sticky notes — an infinite canvas.
          </div>
        )}
      </div>
    </main>
  );
}

function StickyNoteEl({ note, scale }: { note: BoardNote; scale: number }) {
  const updateNote = useBoard((s) => s.updateNote);
  const removeNote = useBoard((s) => s.removeNote);
  const drag = useRef<{ x: number; y: number; nx: number; ny: number } | null>(null);
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const onHeadDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = { x: e.clientX, y: e.clientY, nx: note.x, ny: note.y };
    capture(e.target as Element, e.pointerId);
  };
  const onHeadMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    e.stopPropagation();
    updateNote(note.id, {
      x: drag.current.nx + (e.clientX - drag.current.x) / scale,
      y: drag.current.ny + (e.clientY - drag.current.y) / scale,
    });
  };
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    resize.current = { x: e.clientX, y: e.clientY, w: note.w, h: note.h };
    capture(e.target as Element, e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resize.current) return;
    e.stopPropagation();
    updateNote(note.id, {
      w: Math.max(120, resize.current.w + (e.clientX - resize.current.x) / scale),
      h: Math.max(80, resize.current.h + (e.clientY - resize.current.y) / scale),
    });
  };

  return (
    <div
      className="board-note"
      style={{ left: note.x, top: note.y, width: note.w, height: note.h, background: note.color }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="board-note-head"
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={() => (drag.current = null)}
      >
        <button className="board-note-del" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeNote(note.id)}>
          ×
        </button>
      </div>
      <textarea
        id={`bn-${note.id}`}
        className="board-note-text"
        value={note.text}
        placeholder="Type…"
        onChange={(e) => updateNote(note.id, { text: e.target.value })}
      />
      <div
        className="board-note-resize"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={() => (resize.current = null)}
      />
    </div>
  );
}
