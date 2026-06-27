import { useRef } from "react";
import { useVault } from "../store/useVault";
import { parseFrontmatter } from "../markdown";
import { Plus, Fit } from "../icons";
import "./CanvasView.css";

const CARD_W = 210;
const CARD_H = 120;

function snippet(content: string): string {
  const body = parseFrontmatter(content).body;
  return body
    .replace(/^#.*$/gm, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a || t)
    .replace(/[#*`>_-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export default function CanvasView() {
  const canvas = useVault((s) => s.canvas);
  const notesById = useVault((s) => s.notesById);
  const linkMap = useVault((s) => s.linkMap);
  const moveCard = useVault((s) => s.moveCanvasCard);
  const removeFromCanvas = useVault((s) => s.removeFromCanvas);
  const setTransform = useVault((s) => s.setCanvasTransform);
  const openArticle = useVault((s) => s.openArticle);
  const openMenu = useVault((s) => s.openMenu);
  const addToCanvas = useVault((s) => s.addToCanvas);
  const selectedId = useVault((s) => s.selectedId);

  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: "pan" | "card"; id?: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  const cards = canvas.cards.filter((c) => notesById.has(c.id));
  const present = new Set(cards.map((c) => c.id));

  const edges: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
  const pos = new Map(cards.map((c) => [c.id, c]));
  for (const c of cards) {
    for (const t of linkMap.get(c.id) ?? []) {
      if (!present.has(t) || c.id > t) continue; // dedupe undirected
      const a = pos.get(c.id)!;
      const b = pos.get(t)!;
      edges.push({
        key: `${c.id}-${t}`,
        x1: a.x + CARD_W / 2,
        y1: a.y + CARD_H / 2,
        x2: b.x + CARD_W / 2,
        y2: b.y + CARD_H / 2,
      });
    }
  }

  const onCardDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const card = pos.get(id)!;
    drag.current = { kind: "card", id, sx: e.clientX, sy: e.clientY, ox: card.x, oy: card.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onBoardDown = (e: React.PointerEvent) => {
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: canvas.tx, oy: canvas.ty };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === "pan") setTransform(d.ox + dx, d.oy + dy, canvas.scale);
    else moveCard(d.id!, d.ox + dx / canvas.scale, d.oy + dy / canvas.scale);
  };

  const onUp = () => {
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = boardRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const scale = Math.max(0.3, Math.min(2.4, canvas.scale * factor));
    const ntx = mx - (mx - canvas.tx) * (scale / canvas.scale);
    const nty = my - (my - canvas.ty) * (scale / canvas.scale);
    setTransform(ntx, nty, scale);
  };

  const fit = () => {
    if (!cards.length) return setTransform(40, 30, 1);
    const xs = cards.map((c) => c.x);
    const ys = cards.map((c) => c.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs) + CARD_W;
    const maxY = Math.max(...ys) + CARD_H;
    const rect = boardRef.current!.getBoundingClientRect();
    const scale = Math.min(1.2, (rect.width - 80) / (maxX - minX), (rect.height - 80) / (maxY - minY));
    setTransform(40 - minX * scale, 40 - minY * scale, scale);
  };

  return (
    <main className="canvas-view">
      <header className="canvas-header">
        <div className="canvas-title">
          <h1>Canvas</h1>
          <span className="canvas-subtitle">{cards.length} cards</span>
        </div>
        <div className="canvas-tools">
          <button
            className="seg-btn"
            onClick={() => selectedId && addToCanvas(selectedId)}
            title="Add the selected note as a card"
          >
            <Plus size={14} />
            <span>Add selected</span>
          </button>
          <button className="seg-btn" onClick={fit}>
            <Fit size={14} />
            <span>Fit</span>
          </button>
        </div>
      </header>

      <div
        ref={boardRef}
        className="canvas-board"
        onPointerDown={onBoardDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onWheel={onWheel}
      >
        <div
          className="canvas-content"
          style={{ transform: `translate(${canvas.tx}px, ${canvas.ty}px) scale(${canvas.scale})` }}
        >
          <svg className="canvas-edges">
            {edges.map((e) => (
              <line key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
            ))}
          </svg>
          {cards.map((c) => {
            const note = notesById.get(c.id)!;
            return (
              <div
                key={c.id}
                className="canvas-card"
                style={{ left: c.x, top: c.y, width: CARD_W, minHeight: CARD_H }}
                onPointerDown={(e) => onCardDown(e, c.id)}
                onDoubleClick={() => openArticle(c.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openMenu(e.clientX, e.clientY, c.id);
                }}
              >
                <div className="card-head">
                  <span className="card-title">{note.title}</span>
                  <button
                    className="card-remove"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeFromCanvas(c.id)}
                  >
                    ×
                  </button>
                </div>
                <div className="card-body">{snippet(note.content ?? "")}</div>
              </div>
            );
          })}
        </div>
        <div className="canvas-hint">Drag to pan · scroll to zoom · double-click a card to open</div>
      </div>
    </main>
  );
}
