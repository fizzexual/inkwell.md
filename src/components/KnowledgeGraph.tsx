import { useEffect, useRef } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import "d3-transition";
import { drag } from "d3-drag";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { useVault } from "../store/useVault";
import type { GraphNode } from "../data/derive";
import { parseTags } from "../markdown";
import { buildFolderColors, topFolder } from "../folders";

interface SimNode extends GraphNode, SimulationNodeDatum {}
interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
}

const NODE_FILLS = [
  "var(--node-1)",
  "var(--node-2)",
  "var(--node-3)",
  "var(--node-4)",
  "var(--node-5)",
];
const radius = (d: SimNode) => 4 + Math.min(d.degree, 9) * 1.15;
const fill = (d: SimNode) => NODE_FILLS[Math.min(Math.floor(d.degree / 2), 4)];
const labelled = (d: SimNode) => d.degree >= 3;

// The entrance bloom plays once per session, not on every return to the map.
let introPlayed = false;

export default function KnowledgeGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const graph = useVault((s) => s.graph);
  const selectedId = useVault((s) => s.selectedId);
  const fitNonce = useVault((s) => s.fitNonce);
  const graphLocal = useVault((s) => s.graphLocal);
  const graphColorFolder = useVault((s) => s.graphColorFolder);
  const graphFilter = useVault((s) => s.graphFilter);
  const graphReveal = useVault((s) => s.graphReveal);
  const notesById = useVault((s) => s.notesById);

  // latest-value refs so the d3 callbacks never go stale
  const selectRef = useRef(useVault.getState().select);
  selectRef.current = useVault.getState().select;
  const openArticleRef = useRef(useVault.getState().openArticle);
  openArticleRef.current = useVault.getState().openArticle;
  const openMenuRef = useRef(useVault.getState().openMenu);
  openMenuRef.current = useVault.getState().openMenu;
  const fitRef = useRef<() => void>(() => {});

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    // local mode: keep only the selected note + its neighbours (depth 2)
    let visibleIds: Set<string> | null = null;
    if (graphLocal) {
      visibleIds = new Set([selectedId]);
      for (let depth = 0; depth < 2; depth++) {
        for (const e of graph.edges) {
          if (visibleIds.has(e.source)) visibleIds.add(e.target);
          if (visibleIds.has(e.target)) visibleIds.add(e.source);
        }
      }
    }
    const show = (id: string) => !visibleIds || visibleIds.has(id);

    const folderColors = buildFolderColors(graph.nodes.map((n) => n.folder));
    const colorFor = (d: SimNode) =>
      graphColorFolder ? folderColors.get(topFolder(d.folder)) ?? fill(d) : fill(d);

    const nodes: SimNode[] = graph.nodes.filter((d) => show(d.id)).map((d) => ({ ...d }));
    const links: SimLink[] = graph.edges
      .filter((e) => show(e.source) && show(e.target))
      .map((e) => ({ ...e }));

    const svg = select(svgEl);
    svg.selectAll("*").remove();
    const root = svg.append("g").attr("class", "zoom-layer");
    const edgeLayer = root.append("g").attr("class", "edges");
    const nodeLayer = root.append("g").attr("class", "nodes");

    const playIntro = !introPlayed;
    introPlayed = true;

    const link = edgeLayer
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", playIntro ? "graph-edge intro" : "graph-edge")
      .style("--intro-delay", (_d, i) => (playIntro ? `${220 + Math.min(i * 2, 320)}ms` : null));

    const node = nodeLayer
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", playIntro ? "graph-node intro" : "graph-node")
      .style("--intro-delay", (_d, i) => (playIntro ? `${Math.min(i * 7, 420)}ms` : null))
      .attr("data-id", (d) => d.id)
      .style("cursor", "pointer")
      .on("click", (_e, d) => selectRef.current(d.id))
      .on("dblclick", (e, d) => {
        e.stopPropagation();
        openArticleRef.current(d.id);
      })
      .on("contextmenu", (e, d) => {
        e.preventDefault();
        openMenuRef.current(e.clientX, e.clientY, d.id);
      });

    // neighbour lookup for hover highlighting
    const neighbours = new Map<string, Set<string>>();
    const addNbr = (a: string, b: string) => {
      if (!neighbours.has(a)) neighbours.set(a, new Set());
      neighbours.get(a)!.add(b);
    };
    for (const e of graph.edges) {
      addNbr(e.source, e.target);
      addNbr(e.target, e.source);
    }
    const idOf = (x: SimNode | string) => (typeof x === "string" ? x : x.id);

    node
      .on("mouseenter", (_e, d) => {
        const near = neighbours.get(d.id);
        node.classed("hover-hot", (n) => n.id === d.id || !!near?.has(n.id));
        node.classed("hover-faded", (n) => n.id !== d.id && !near?.has(n.id));
        link.classed("hover-hot", (l) => idOf(l.source) === d.id || idOf(l.target) === d.id);
      })
      .on("mouseleave", () => {
        node.classed("hover-hot", false).classed("hover-faded", false);
        link.classed("hover-hot", false);
      });

    node.append("circle").attr("class", "ring").attr("r", (d) => radius(d) + 4);
    node
      .append("circle")
      .attr("class", "dot")
      .attr("r", radius)
      .attr("fill", colorFor);
    node
      .filter(labelled)
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => radius(d) + 12)
      .text((d) => d.title);

    const sim: Simulation<SimNode, undefined> = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(58)
          .strength(0.55),
      )
      .force("charge", forceManyBody().strength(-185))
      .force("collide", forceCollide<SimNode>((d) => radius(d) + 10))
      .force("x", forceX(0).strength(0.045))
      .force("y", forceY(0).strength(0.045))
      .force("center", forceCenter(0, 0))
      .stop();

    const ticked = () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);
      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    };
    sim.on("tick", ticked);

    // Settle the layout synchronously so the graph is laid out instantly,
    // independent of requestAnimationFrame (which is paused in background tabs).
    sim.tick(320);
    ticked();

    // ---- zoom / pan ----
    const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 3])
      .on("zoom", (e) => root.attr("transform", e.transform.toString()));
    svg.call(zoomBehavior).on("dblclick.zoom", null);

    // ---- drag nodes ----
    const dragBehavior = drag<SVGGElement, SimNode>()
      .on("start", (e, d) => {
        if (!e.active) sim.alphaTarget(0.25).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (e, d) => {
        d.fx = e.x;
        d.fy = e.y;
      })
      .on("end", (e, d) => {
        if (!e.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(dragBehavior as never);

    // ---- fit-to-view (instant; rAF-free) ----
    const fitView = (animate = false) => {
      const xs = nodes.map((d) => d.x ?? 0);
      const ys = nodes.map((d) => d.y ?? 0);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const w = svgEl.clientWidth || 800;
      const h = svgEl.clientHeight || 600;
      const pad = 96;
      const gw = maxX - minX || 1;
      const gh = maxY - minY || 1;
      const scale = Math.min(1.6, (w - pad) / gw, (h - pad) / gh);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const t = zoomIdentity
        .translate(w / 2, h / 2)
        .scale(scale)
        .translate(-cx, -cy);
      const target = animate ? svg.transition().duration(420) : svg;
      (target as typeof svg).call(zoomBehavior.transform, t);
    };
    fitRef.current = () => fitView(true);

    fitView(false);

    // keep the graph framed when the panel resizes
    let firstRO = true;
    const ro = new ResizeObserver(() => {
      if (firstRO) {
        firstRO = false;
        return;
      }
      fitView(false);
    });
    ro.observe(svgEl);

    return () => {
      ro.disconnect();
      sim.stop();
    };
  }, [graph, graphColorFolder, graphLocal, graphLocal ? selectedId : ""]);

  // ---- run fit when requested from the header ----
  useEffect(() => {
    if (fitNonce > 0) fitRef.current();
  }, [fitNonce]);

  // ---- filter + timelapse reveal (no re-layout) ----
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const order = new Map<string, number>();
    [...graph.nodes].sort((a, b) => b.degree - a.degree).forEach((n, i) => order.set(n.id, i));
    const f = graphFilter.trim().toLowerCase();
    const matches = (id: string) => {
      if (!f) return true;
      const note = notesById.get(id);
      if (!note) return false;
      if (f.startsWith("#")) return parseTags(note.content ?? "").some((t) => `#${t}`.includes(f));
      return note.title.toLowerCase().includes(f) || note.folder.toLowerCase().includes(f);
    };
    const visible = (id: string) =>
      matches(id) && (graphReveal == null || (order.get(id) ?? 0) < graphReveal);

    const idOf = (x: SimNode | string) => (typeof x === "string" ? x : x.id);
    const svg = select(svgEl);
    svg.selectAll<SVGGElement, SimNode>("g.graph-node").style("display", (d) => (visible(d.id) ? "" : "none"));
    svg
      .selectAll<SVGLineElement, SimLink>("line.graph-edge")
      .style("display", (d) => (visible(idOf(d.source)) && visible(idOf(d.target)) ? "" : "none"));
  }, [graphFilter, graphReveal, graph, notesById]);

  // ---- highlight selection + neighbours ----
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const neighbours = new Set<string>([selectedId]);
    for (const e of graph.edges) {
      if (e.source === selectedId) neighbours.add(e.target);
      if (e.target === selectedId) neighbours.add(e.source);
    }
    const svg = select(svgEl);
    svg
      .selectAll<SVGGElement, SimNode>("g.graph-node")
      .each(function (d) {
        const g = select(this);
        const isSel = d.id === selectedId;
        const isNeighbour = neighbours.has(d.id);
        g.classed("selected", isSel);
        g.classed("dim-strong", isNeighbour && !isSel);
        g.classed("faded", !isNeighbour);
      });
    svg
      .selectAll<SVGLineElement, SimLink>("line.graph-edge")
      .each(function (d) {
        const s = typeof d.source === "string" ? d.source : d.source.id;
        const t = typeof d.target === "string" ? d.target : d.target.id;
        const touches = s === selectedId || t === selectedId;
        select(this).classed("lit", touches).classed("faded", !touches);
      });
  }, [selectedId, graph]);

  return <svg ref={svgRef} className="graph-svg" />;
}
