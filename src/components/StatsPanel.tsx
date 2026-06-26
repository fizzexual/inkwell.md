import { useMemo } from "react";
import { useVault } from "../store/useVault";
import { parseTags } from "../markdown";
import "./StatsPanel.css";

export default function StatsPanel() {
  const notes = useVault((s) => s.notes);
  const graph = useVault((s) => s.graph);
  const openArticle = useVault((s) => s.openArticle);

  const stats = useMemo(() => {
    const degree = new Map(graph.nodes.map((n) => [n.id, n.degree]));
    const sources = notes.filter((n) => n.kind === "source").length;
    const tags = new Set<string>();
    for (const n of notes) for (const t of parseTags(n.content ?? "")) tags.add(t);
    const orphans = graph.nodes.filter((n) => n.degree === 0);
    const topLinked = [...graph.nodes].sort((a, b) => b.degree - a.degree).slice(0, 6);

    const folders = new Map<string, number>();
    for (const n of notes) {
      const top = n.folder ? n.folder.split("/")[0] : "(root)";
      folders.set(top, (folders.get(top) ?? 0) + 1);
    }

    return {
      notes: notes.length,
      sources,
      links: graph.edges.length,
      tags: tags.size,
      orphans,
      topLinked,
      folders: [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      degree,
    };
  }, [notes, graph]);

  return (
    <div className="stats-panel">
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-num">{stats.notes}</div>
          <div className="stat-label">Notes</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.links}</div>
          <div className="stat-label">Links</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.sources}</div>
          <div className="stat-label">Sources</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.tags}</div>
          <div className="stat-label">Tags</div>
        </div>
      </div>

      <div className="stat-section">
        <div className="stat-heading">Most linked</div>
        {stats.topLinked.map((n) => (
          <button key={n.id} className="stat-row" onClick={() => openArticle(n.id)}>
            <span className="stat-row-title">{n.title}</span>
            <span className="stat-pill">{n.degree}</span>
          </button>
        ))}
      </div>

      <div className="stat-section">
        <div className="stat-heading">Folders</div>
        {stats.folders.map(([name, count]) => (
          <div key={name} className="stat-row static">
            <span className="stat-row-title">{name === "(root)" ? "Vault root" : name}</span>
            <span className="stat-pill ghost">{count}</span>
          </div>
        ))}
      </div>

      <div className="stat-section">
        <div className="stat-heading">Orphans ({stats.orphans.length})</div>
        {stats.orphans.length === 0 ? (
          <div className="stat-muted">Every note is connected.</div>
        ) : (
          stats.orphans.map((n) => (
            <button key={n.id} className="stat-row" onClick={() => openArticle(n.id)}>
              <span className="stat-row-title">{n.title}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
