import { useEffect, useRef } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { useVault } from "../store/useVault";
import type { GraphNode } from "../data/derive";
import { buildFolderColors, topFolder } from "../folders";
import "./ConstellationView.css";

interface SimNode extends GraphNode, SimulationNodeDatum {}
interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
}

export default function ConstellationView() {
  const graph = useVault((s) => s.graph);
  const close = () => useVault.getState().setConstellation(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const folderColors = buildFolderColors(graph.nodes.map((n) => n.folder));
    const colorOf = (n: SimNode) => folderColors.get(topFolder(n.folder)) || "#8b8b94";

    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
    const links = graph.edges.map((e) => ({ source: e.source, target: e.target }));
    const byId = new Map(nodes.map((n) => [n.id, n]));

    const sim: Simulation<SimNode, undefined> = forceSimulation(nodes)
      .force("charge", forceManyBody().strength(-220))
      .force(
        "link",
        forceLink(links)
          .id((d) => (d as SimNode).id)
          .distance(70)
          .strength(0.5),
      )
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide<SimNode>().radius((d) => 8 + Math.min(d.degree, 9) * 1.6))
      .stop();
    for (let i = 0; i < 240; i++) sim.tick();

    const radius = (d: SimNode) => 3.5 + Math.min(d.degree, 10) * 1.5;

    const cam = { x: 0, y: 0, scale: 1 };
    let stars: Star[] = [];
    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      cam.x = W / 2;
      cam.y = H / 2;
      stars = Array.from({ length: 150 }, (_, i) => ({
        x: ((i * 9301 + 49297) % 233280) / 233280 * W,
        y: ((i * 49297 + 233280) % 9301) / 9301 * H,
        r: ((i * 13) % 10) / 10 < 0.85 ? 0.7 : 1.5,
        a: 0.15 + (((i * 7) % 10) / 10) * 0.45,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    let hover: SimNode | null = null;
    const mouse = { x: -1, y: -1 };
    const drag = { active: false, sx: 0, sy: 0, cx: 0, cy: 0, moved: false };

    const toScreen = (n: SimNode) => ({ x: (n.x ?? 0) * cam.scale + cam.x, y: (n.y ?? 0) * cam.scale + cam.y });

    let raf = 0;
    const draw = (t: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // background
      const g = ctx.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H / 2, Math.max(W, H));
      g.addColorStop(0, "#11121b");
      g.addColorStop(1, "#06060a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // stars
      for (const s of stars) {
        ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(t / 900 + s.x));
        ctx.fillStyle = "#cfd2ff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // gentle drift offset per node (doesn't disturb layout)
      const pos = (n: SimNode) => {
        const sc = toScreen(n);
        const i = n.degree;
        return { x: sc.x + Math.sin(t / 1600 + i) * 2.2, y: sc.y + Math.cos(t / 1700 + i * 1.3) * 2.2 };
      };

      // edges
      const hoverNeighbors = new Set<string>();
      if (hover) {
        for (const e of graph.edges) {
          if (e.source === hover.id) hoverNeighbors.add(e.target);
          if (e.target === hover.id) hoverNeighbors.add(e.source);
        }
      }
      ctx.lineWidth = 1;
      for (const e of graph.edges) {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;
        const pa = pos(a);
        const pb = pos(b);
        const lit = hover && (e.source === hover.id || e.target === hover.id);
        ctx.strokeStyle = lit ? "rgba(150,160,255,0.55)" : "rgba(120,125,170,0.13)";
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // nodes
      for (const n of nodes) {
        const p = pos(n);
        const r = radius(n) * cam.scale;
        const isHover = hover?.id === n.id;
        const dim = hover && !isHover && !hoverNeighbors.has(n.id);
        const c = colorOf(n);
        ctx.globalAlpha = dim ? 0.3 : 1;
        ctx.shadowBlur = isHover ? 26 : 12;
        ctx.shadowColor = c;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isHover ? r + 2 : r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // labels
        if (!dim && (n.degree >= 4 || isHover)) {
          ctx.globalAlpha = isHover ? 1 : 0.7;
          ctx.fillStyle = "#e7e8f5";
          ctx.font = `${isHover ? 13 : 11}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.title, p.x, p.y - r - 6);
        }
      }
      ctx.globalAlpha = 1;
    };
    const frame = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    draw(0); // paint one frame immediately (covers throttled-rAF cases)

    // interaction
    const pick = (mx: number, my: number): SimNode | null => {
      let best: SimNode | null = null;
      let bestD = 18 * 18;
      for (const n of nodes) {
        const sc = toScreen(n);
        const d = (sc.x - mx) ** 2 + (sc.y - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    };
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      if (drag.active) {
        cam.x = drag.cx + (mouse.x - drag.sx);
        cam.y = drag.cy + (mouse.y - drag.sy);
        if (Math.abs(mouse.x - drag.sx) + Math.abs(mouse.y - drag.sy) > 4) drag.moved = true;
        return;
      }
      hover = pick(mouse.x, mouse.y);
      canvas.style.cursor = hover ? "pointer" : "grab";
      draw(performance.now());
    };
    const onDown = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      drag.active = true;
      drag.moved = false;
      drag.sx = e.clientX - r.left;
      drag.sy = e.clientY - r.top;
      drag.cx = cam.x;
      drag.cy = cam.y;
    };
    const onUp = () => {
      if (drag.active && !drag.moved && hover) {
        useVault.getState().openArticle(hover.id);
        close();
      }
      drag.active = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.0012);
      const ns = Math.max(0.3, Math.min(3, cam.scale * factor));
      const wx = (mx - cam.x) / cam.scale;
      const wy = (my - cam.y) / cam.scale;
      cam.scale = ns;
      cam.x = mx - wx * ns;
      cam.y = my - wy * ns;
      draw(performance.now());
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      sim.stop();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [graph]);

  return (
    <div className="constellation">
      <canvas ref={canvasRef} className="constellation-canvas" />
      <div className="constellation-bar">
        <span className="constellation-title">✦ Constellation</span>
        <span className="constellation-hint">drag to pan · scroll to zoom · click a star to open</span>
        <button className="constellation-close" onClick={close}>
          Close ✕
        </button>
      </div>
    </div>
  );
}
