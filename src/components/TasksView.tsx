import { useMemo, useState } from "react";
import { useVault } from "../store/useVault";
import { parseTasks } from "../markdown";
import "./TasksView.css";

const cleanText = (s: string) =>
  s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, alias) => alias || t).replace(/[*`_]/g, "");

interface TaskItem {
  noteId: string;
  noteTitle: string;
  line: number;
  done: boolean;
  text: string;
}

export default function TasksView() {
  const notes = useVault((s) => s.notes);
  const notesById = useVault((s) => s.notesById);
  const openArticle = useVault((s) => s.openArticle);
  const updateContent = useVault((s) => s.updateContent);
  const [showDone, setShowDone] = useState(false);

  const groups = useMemo(() => {
    const all: TaskItem[] = notes.flatMap((n) =>
      parseTasks(n.content ?? "").map((t) => ({
        noteId: n.id,
        noteTitle: n.title,
        line: t.line,
        done: t.done,
        text: t.text,
      })),
    );
    const visible = showDone ? all : all.filter((t) => !t.done);
    const byNote = new Map<string, TaskItem[]>();
    for (const t of visible) {
      const arr = byNote.get(t.noteId) ?? [];
      arr.push(t);
      byNote.set(t.noteId, arr);
    }
    return [...byNote.entries()].map(([id, items]) => ({
      id,
      title: notesById.get(id)?.title ?? id,
      items,
    }));
  }, [notes, notesById, showDone]);

  const counts = useMemo(() => {
    let open = 0;
    let done = 0;
    for (const n of notes)
      for (const t of parseTasks(n.content ?? "")) t.done ? done++ : open++;
    return { open, done };
  }, [notes]);

  const toggle = (noteId: string, line: number, done: boolean) => {
    const note = notesById.get(noteId);
    if (!note?.content) return;
    const lines = note.content.split("\n");
    lines[line] = lines[line].replace(/\[([ xX])\]/, done ? "[ ]" : "[x]");
    updateContent(noteId, lines.join("\n"));
  };

  return (
    <main className="tasks-view">
      <header className="tasks-header">
        <div className="tasks-title">
          <h1>Tasks</h1>
          <span className="tasks-subtitle">
            {counts.open} open · {counts.done} done
          </span>
        </div>
        <button
          className={"seg-btn" + (showDone ? " active" : "")}
          onClick={() => setShowDone((v) => !v)}
        >
          {showDone ? "Hide done" : "Show done"}
        </button>
      </header>

      <div className="tasks-scroll">
        {groups.length === 0 && <div className="tasks-empty">No open tasks. 🎉</div>}
        {groups.map((g) => (
          <section className="task-group" key={g.id}>
            <button className="task-group-title" onClick={() => openArticle(g.id)}>
              {g.title}
            </button>
            {g.items.map((t) => (
              <label className={"task-row" + (t.done ? " done" : "")} key={t.line}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggle(t.noteId, t.line, t.done)}
                />
                <span className="task-box" />
                <span className="task-text">{cleanText(t.text)}</span>
              </label>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
