import { useVault } from "../store/useVault";
import KnowledgeGraph from "./KnowledgeGraph";
import { buildFolderColors } from "../folders";
import { Focus, Palette, Fit, Search, Sparkles } from "../icons";
import "./KnowledgeMap.css";

export default function KnowledgeMap() {
  const requestFit = useVault((s) => s.requestFit);
  const graphLocal = useVault((s) => s.graphLocal);
  const graphColorFolder = useVault((s) => s.graphColorFolder);
  const toggleGraphLocal = useVault((s) => s.toggleGraphLocal);
  const toggleGraphColorFolder = useVault((s) => s.toggleGraphColorFolder);
  const graph = useVault((s) => s.graph);
  const graphFilter = useVault((s) => s.graphFilter);
  const setGraphFilter = useVault((s) => s.setGraphFilter);
  const setGraphReveal = useVault((s) => s.setGraphReveal);

  const replay = () => {
    const total = graph.nodes.length;
    const start = performance.now();
    const dur = 3600;
    setGraphReveal(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setGraphReveal(Math.round(t * total));
      if (t < 1) requestAnimationFrame(tick);
      else setGraphReveal(null);
    };
    requestAnimationFrame(tick);
  };

  const folderColors = graphColorFolder ? buildFolderColors(graph.nodes.map((n) => n.folder)) : null;

  return (
    <main className="map">
      <header className="map-header">
        <div className="map-title">
          <h1>Knowledge Map</h1>
          <span className="map-subtitle">{graphLocal ? "Local graph" : "Deep Learning"}</span>
        </div>
        <div className="map-tools">
          <div className="map-filter">
            <Search size={13} />
            <input
              value={graphFilter}
              placeholder="filter… (#tag, folder, title)"
              onChange={(e) => setGraphFilter(e.target.value)}
            />
            {graphFilter && (
              <button className="map-filter-clear" onClick={() => setGraphFilter("")}>
                ×
              </button>
            )}
          </div>
          <button className="seg-btn" onClick={replay} title="Replay how the graph grew">
            ▶<span>Replay</span>
          </button>
          <button
            className={"seg-btn" + (graphLocal ? " active" : "")}
            onClick={toggleGraphLocal}
            title="Show only the selected note and its neighbours"
          >
            <Focus size={14} />
            <span>Local</span>
          </button>
          <button
            className={"seg-btn" + (graphColorFolder ? " active" : "")}
            onClick={toggleGraphColorFolder}
            title="Colour nodes by folder"
          >
            <Palette size={14} />
            <span>Color</span>
          </button>
          <button className="seg-btn" onClick={requestFit}>
            <Fit size={14} />
            <span>Fit</span>
          </button>
          <button
            className="seg-btn"
            onClick={() => useVault.getState().setConstellation(true)}
            title="Open the immersive constellation view"
          >
            <Sparkles size={14} />
            <span>Constellation</span>
          </button>
        </div>
      </header>
      <div className="map-canvas">
        <KnowledgeGraph />
        {folderColors && (
          <div className="graph-legend">
            {[...folderColors.entries()].map(([name, color]) => (
              <div className="legend-row" key={name}>
                <span className="legend-dot" style={{ background: color }} />
                <span className="legend-name">{name.replace(/^\d+\s*-\s*/, "")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
