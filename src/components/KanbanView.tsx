import { useMemo, useState } from "react";
import { useVault } from "../store/useVault";
import { parseFrontmatter } from "../markdown";
import "./KanbanView.css";

const DEFAULTS = ["idea", "draft", "active", "review", "written", "done"];
const NONE = "";

export default function KanbanView() {
  const notes = useVault((s) => s.notes);
  const setProperty = useVault((s) => s.setProperty);
  const openArticle = useVault((s) => s.openArticle);
  const openMenu = useVault((s) => s.openMenu);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const { columns, byStatus } = useMemo(() => {
    const byStatus = new Map<string, { id: string; title: string; folder: string }[]>();
    const present = new Set<string>();
    for (const n of notes) {
      const st = String(parseFrontmatter(n.content ?? "").data.status ?? "").trim().toLowerCase();
      present.add(st);
      const arr = byStatus.get(st) ?? [];
      arr.push({ id: n.id, title: n.title, folder: n.folder });
      byStatus.set(st, arr);
    }
    const extras = [...present].filter((s) => s && !DEFAULTS.includes(s));
    const columns = [...new Set([...DEFAULTS, ...extras]), NONE];
    return { columns, byStatus };
  }, [notes]);

  const drop = (status: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) setProperty(id, "status", status);
  };

  return (
    <main className="kanban-view">
      <header className="kanban-header">
        <div className="kanban-title">
          <h1>Board</h1>
          <span className="kanban-subtitle">by status · drag cards between columns</span>
        </div>
      </header>

      <div className="kanban-board">
        {columns.map((status) => {
          const cards = byStatus.get(status) ?? [];
          return (
            <div
              key={status || "none"}
              className={"kanban-col" + (dragOver === status ? " over" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((d) => (d === status ? null : d))}
              onDrop={(e) => drop(status, e)}
            >
              <div className="kanban-col-head">
                <span className="kanban-col-name">{status || "No status"}</span>
                <span className="kanban-col-count">{cards.length}</span>
              </div>
              <div className="kanban-cards">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                    onClick={() => openArticle(c.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openMenu(e.clientX, e.clientY, c.id);
                    }}
                  >
                    <div className="kanban-card-title">{c.title}</div>
                    {c.folder && <div className="kanban-card-folder">{c.folder.split("/")[0]}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
