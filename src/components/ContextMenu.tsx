import { useEffect, type ReactNode } from "react";
import { useVault } from "../store/useVault";
import { useChat } from "../ai/useChat";
import { Doc, Pencil, Copy, Graph, SplitView, Board, Pin, Palette, Trash, Sparkles } from "../icons";
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
  const addToCanvas = useVault((s) => s.addToCanvas);
  const duplicateNote = useVault((s) => s.duplicateNote);
  const deleteNote = useVault((s) => s.deleteNote);
  const togglePin = useVault((s) => s.togglePin);
  const pinned = useVault((s) => s.pinned);
  const openPicker = useVault((s) => s.openPicker);
  const toast = useVault((s) => s.toast);

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
      onClick: run(() => {
        navigator.clipboard?.writeText(`[[${note.title}]]`);
        toast("Copied link to clipboard");
      }),
    },
    {
      icon: <Copy size={15} />,
      label: "Copy as Markdown",
      onClick: run(() => {
        navigator.clipboard?.writeText(note.content ?? "");
        toast("Copied Markdown to clipboard");
      }),
    },
    {
      icon: <Doc size={15} />,
      label: "Duplicate",
      onClick: run(() => duplicateNote(note.id)),
    },
    {
      icon: <Doc size={15} />,
      label: "Export as .md",
      onClick: run(() => {
        const blob = new Blob([note.content ?? ""], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${note.title}.md`;
        a.click();
        URL.revokeObjectURL(url);
        toast(`Exported “${note.title}.md”`);
      }),
    },
    {
      icon: <Graph size={15} />,
      label: "Show in graph",
      onClick: run(() => {
        select(note.id);
        setCenterView("graph");
      }),
    },
    {
      icon: <Sparkles size={15} />,
      label: "Ask AI about this",
      onClick: run(() => {
        useVault.setState({ aiOpen: true });
        useChat.getState().send(`Summarise the note "${note.title}" in a few concise bullet points, citing it.`);
      }),
    },
    {
      icon: <Board size={15} />,
      label: "Add to canvas",
      onClick: run(() => {
        addToCanvas(note.id);
        toast(`Added “${note.title}” to canvas`);
      }),
    },
    {
      icon: <Pin size={15} />,
      label: pinned.includes(note.id) ? "Unpin" : "Pin to top",
      onClick: run(() => togglePin(note.id)),
    },
    {
      icon: <Palette size={15} />,
      label: "Set icon…",
      onClick: () => openPicker(menu.x, menu.y, "icon", note.id),
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
