import { useVault } from "../store/useVault";
import KnowledgeGraph from "./KnowledgeGraph";
import { Link, Sources, Fit } from "../icons";
import "./KnowledgeMap.css";

export default function KnowledgeMap() {
  const mapView = useVault((s) => s.mapView);
  const setMapView = useVault((s) => s.setMapView);
  const requestFit = useVault((s) => s.requestFit);

  return (
    <main className="map">
      <header className="map-header">
        <div className="map-title">
          <h1>Knowledge Map</h1>
          <span className="map-subtitle">Deep Learning</span>
        </div>
        <div className="map-tools">
          <button
            className={"seg-btn" + (mapView === "links" ? " active" : "")}
            onClick={() => setMapView("links")}
          >
            <Link size={14} />
            <span>Links</span>
          </button>
          <button
            className={"seg-btn" + (mapView === "sources" ? " active" : "")}
            onClick={() => setMapView("sources")}
          >
            <Sources size={14} />
            <span>Sources</span>
          </button>
          <button className="seg-btn" onClick={requestFit}>
            <Fit size={14} />
            <span>Fit</span>
          </button>
        </div>
      </header>
      <div className="map-canvas">
        <KnowledgeGraph />
      </div>
    </main>
  );
}
