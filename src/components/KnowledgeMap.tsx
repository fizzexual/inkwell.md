import { useVault } from "../store/useVault";
import KnowledgeGraph from "./KnowledgeGraph";
import { buildFolderColors } from "../folders";
import { Focus, Palette, Fit } from "../icons";
import "./KnowledgeMap.css";

export default function KnowledgeMap() {
  const requestFit = useVault((s) => s.requestFit);
  const graphLocal = useVault((s) => s.graphLocal);
  const graphColorFolder = useVault((s) => s.graphColorFolder);
  const toggleGraphLocal = useVault((s) => s.toggleGraphLocal);
  const toggleGraphColorFolder = useVault((s) => s.toggleGraphColorFolder);
  const graph = useVault((s) => s.graph);

  const folderColors = graphColorFolder ? buildFolderColors(graph.nodes.map((n) => n.folder)) : null;

  return (
    <main className="map">
      <header className="map-header">
        <div className="map-title">
          <h1>Knowledge Map</h1>
          <span className="map-subtitle">{graphLocal ? "Local graph" : "Deep Learning"}</span>
        </div>
        <div className="map-tools">
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
