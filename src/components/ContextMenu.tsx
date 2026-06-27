import { useEffect, type ReactNode } from "react";
import { useVault } from "../store/useVault";
import { Doc, Pencil, Copy, Graph, SplitView, Trash } from "../icons";
import "./ContextMenu.css";

interface Item {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export default function ContextMenu() {
  const menu = useVault((s) => s.menu);
  const close = useVault((s) => s.closeMenu);
  const notesById = useVault((s) => s.notesById);
  const openArticle = useVault((s) => s.openArticle);
  const setEditing = useVault((s) => s.setEditing);
  const select = useVault((s) => s.select);
  const setCenterView = useVault((s) => s.setCenterView);
  const openInTab = useVault((s) => s.openInTab);
  const splitWith = useVault((s) => s.splitWith);
  const deleteNote = useVault((s) => s.deleteNote);

  useEffect(() => {
    if (!menu) return;
    const onDown = () => close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;
  const note = notesById.get(menu.noteId);
  if (!note) return null;

  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  const items: (Item | "sep")[] = [
    { icon: <Doc size={15} />, label: "Open", onClick: run(() => openArticle(note.id)) },
    { icon: <SplitView size={15} />, label: "Open in new tab", onClick: run(() => openInTab(note.id)) },
    { icon: <SplitView size={15} />, label: "Open to the side", onClick: run(() => splitWith(note.id)) },
    "sep",
    {
      icon: <Pencil size={15} />,
      label: "Edit",
      onClick: run(() => {
        openArticle(note.id);
        setEditing(true);
      }),
    },
    {
      icon: <Copy size={15} />,
      label: "Copy as link",
      onClick: run(() => navigator.clipboard?.writeText(`[[${note.title}]]`)),
    },
    {
      icon: <Graph size={15} />,
      label: "Show in graph",
      onClick: run(() => {
        select(note.id);
        setCenterView("graph");
      }),
    },
    "sep",
    {
      icon: <Trash size={15} />,
      label: "Delete note",
      danger: true,
      onClick: run(() => deleteNote(note.id)),
    },
  ];

  const left = Math.min(menu.x, window.innerWidth - 224);
  const top = Math.min(menu.y, window.innerHeight - 320);

  return (
    <div className="ctx-menu" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ctx-title">{note.title}</div>
      {items.map((it, i) =>
        it === "sep" ? (
          <div className="ctx-sep" key={i} />
        ) : (
          <button
            key={i}
            className={"ctx-item" + (it.danger ? " danger" : "")}
            onClick={it.onClick}
          >
            {it.icon}
            <span>{it.label}</span>
          </button>
        ),
      )}
    </div>
  );
}
