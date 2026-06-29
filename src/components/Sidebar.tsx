import { useRef, useState } from "react";
import { useVault } from "../store/useVault";
import type { SidebarView } from "../store/useVault";
import type { TreeFolder } from "../data/derive";
import type { Note } from "../data/vault";
import { TEMPLATES } from "../templates";
import { useSmoothScroll } from "../useSmoothScroll";
import SearchPanel from "./SearchPanel";
import StatsPanel from "./StatsPanel";
import {
  BarChart,
  NoteEdit,
  Graph,
  Table,
  CheckSquare,
  Board,
  FunctionIcon,
  Calendar,
  Columns,
  Cards,
  Brush,
  StickyNote,
  Search,
  Tag,
  Import,
  FolderPlus,
  Plus,
  Pencil,
  OpenExternal,
  ChevronDown,
  ChevronRight,
  Folder,
  Doc,
  Pin,
  Templates,
} from "../icons";
import "./Sidebar.css";

const VIEWS: { id: SidebarView; Icon: typeof BarChart; label: string }[] = [
  { id: "stats", Icon: BarChart, label: "Overview" },
  { id: "notes", Icon: NoteEdit, label: "Notes" },
  { id: "graph", Icon: Graph, label: "Knowledge map" },
  { id: "table", Icon: Table, label: "Table" },
  { id: "tasks", Icon: CheckSquare, label: "Tasks" },
  { id: "kanban", Icon: Columns, label: "Board" },
  { id: "canvas", Icon: Board, label: "Canvas" },
  { id: "math", Icon: FunctionIcon, label: "Math Engine" },
  { id: "daily", Icon: Calendar, label: "Journal" },
  { id: "cards", Icon: Cards, label: "Flashcards" },
  { id: "sketch", Icon: Brush, label: "Sketch" },
  { id: "board", Icon: StickyNote, label: "Whiteboard" },
  { id: "search", Icon: Search, label: "Search" },
];

function NoteRow({ note }: { note: Note }) {
  const selectedId = useVault((s) => s.selectedId);
  const openArticle = useVault((s) => s.openArticle);
  const openMenu = useVault((s) => s.openMenu);
  const icon = useVault((s) => s.noteIcons[note.id]);
  const active = note.id === selectedId;
  return (
    <button
      className={"tree-item note" + (active ? " active" : "")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/inkwell-note", note.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => openArticle(note.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, note.id);
      }}
      title={note.title}
    >
      {icon ? <span className="tree-emoji">{icon}</span> : <Doc className="tree-icon doc" size={15} />}
      <span className="tree-label">{note.title}</span>
    </button>
  );
}

function FolderRow({ folder, depth }: { folder: TreeFolder; depth: number }) {
  const expanded = useVault((s) => s.expanded);
  const toggle = useVault((s) => s.toggleFolder);
  const openPicker = useVault((s) => s.openPicker);
  const moveNote = useVault((s) => s.moveNote);
  const color = useVault((s) => s.folderColors[folder.path]);
  const [dropping, setDropping] = useState(false);
  const open = expanded.has(folder.path);
  return (
    <div className="tree-folder">
      <button
        className={"tree-item folder" + (dropping ? " drop-target" : "")}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => toggle(folder.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          openPicker(e.clientX, e.clientY, "color", folder.path);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("text/inkwell-note")) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/inkwell-note");
          setDropping(false);
          if (id) moveNote(id, folder.path);
        }}
        title={folder.name}
      >
        <span className={"chev" + (open ? " open" : "")}>
          <ChevronRight size={13} />
        </span>
        <Folder className="tree-icon" size={15} style={color ? { color } : undefined} />
        <span className="tree-label">{folder.name}</span>
      </button>
      {open && (
        <div className="tree-children">
          {folder.folders.map((f) => (
            <FolderRow key={f.path} folder={f} depth={depth + 1} />
          ))}
          {folder.notes.map((nt) => (
            <div key={nt.id} style={{ paddingLeft: depth * 14 }}>
              <NoteRow note={nt} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PinnedSection() {
  const pinned = useVault((s) => s.pinned);
  const notesById = useVault((s) => s.notesById);
  const selectedId = useVault((s) => s.selectedId);
  const openArticle = useVault((s) => s.openArticle);
  const openMenu = useVault((s) => s.openMenu);
  const items = pinned.map((id) => notesById.get(id)).filter((n): n is Note => !!n);
  if (!items.length) return null;
  return (
    <div className="pinned-section">
      <div className="pinned-label">
        <Pin size={11} /> Pinned
      </div>
      {items.map((note) => (
        <button
          key={note.id}
          className={"tree-item note pinned" + (note.id === selectedId ? " active" : "")}
          onClick={() => openArticle(note.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu(e.clientX, e.clientY, note.id);
          }}
          title={note.title}
        >
          <Pin className="tree-icon" size={13} />
          <span className="tree-label">{note.title}</span>
        </button>
      ))}
    </div>
  );
}

export default function Sidebar() {
  const tree = useVault((s) => s.tree);
  const sidebarView = useVault((s) => s.sidebarView);
  const setSidebarView = useVault((s) => s.setSidebarView);
  const createNote = useVault((s) => s.createNote);
  const createNoteWith = useVault((s) => s.createNoteWith);
  const setAllFolders = useVault((s) => s.setAllFolders);
  const setClipOpen = useVault((s) => s.setClipOpen);
  const anyExpanded = useVault((s) => s.expanded.size > 0);
  const openPdf = useVault((s) => s.openPdf);
  const width = useVault((s) => s.sidebarWidth);
  const treeRef = useRef<HTMLDivElement>(null);
  useSmoothScroll(treeRef);
  const [tplOpen, setTplOpen] = useState(false);

  const onImportPdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) file.arrayBuffer().then((buf) => openPdf(file.name, buf));
    e.target.value = "";
  };

  return (
    <aside className="sidebar" style={{ width, minWidth: width }}>
      <div className="vault-header">
        <button className="vault-name">
          <span>{tree.name}</span>
          <ChevronDown size={14} className="vault-caret" />
        </button>
        <div className="vault-actions">
          <button className="ghost-btn" aria-label="Edit vault">
            <Pencil size={15} />
          </button>
          <button className="ghost-btn" aria-label="New note" onClick={() => createNote()}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="view-tabs">
        {VIEWS.map(({ id, Icon, label }) => (
          <button
            key={id}
            className={"view-tab" + (sidebarView === id ? " active" : "")}
            onClick={() => setSidebarView(id)}
            title={label}
            aria-label={label}
          >
            <Icon size={17} />
          </button>
        ))}
      </div>

      {sidebarView === "search" ? (
        <SearchPanel />
      ) : sidebarView === "stats" ? (
        <StatsPanel />
      ) : (
        <>
          <div className="tree-toolbar">
            <button
              className="ghost-btn sm"
              aria-label={anyExpanded ? "Collapse all" : "Expand all"}
              title={anyExpanded ? "Collapse all folders" : "Expand all folders"}
              onClick={() => setAllFolders(!anyExpanded)}
            >
              {anyExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            <button className="ghost-btn sm" aria-label="Tags">
              <Tag size={15} />
            </button>
            <label className="ghost-btn sm" aria-label="Import PDF" title="Open a PDF">
              <Import size={15} />
              <input type="file" accept="application/pdf" onChange={onImportPdf} hidden />
            </label>
            <button
              className="ghost-btn sm"
              aria-label="Clip web page"
              title="Clip a web page"
              onClick={() => setClipOpen(true)}
            >
              <OpenExternal size={15} />
            </button>
            <div className="tpl-wrap">
              <button
                className="ghost-btn sm"
                aria-label="New from template"
                title="New from template"
                onClick={() => setTplOpen((o) => !o)}
              >
                <Templates size={15} />
              </button>
              {tplOpen && (
                <>
                  <div className="tpl-overlay" onClick={() => setTplOpen(false)} />
                  <div className="tpl-menu">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        className="tpl-item"
                        onClick={() => {
                          const d = new Date();
                          createNoteWith(t.title(d), t.body(d), t.folder);
                          setTplOpen(false);
                        }}
                      >
                        <span className="tpl-icon">{t.icon}</span>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button className="ghost-btn sm" aria-label="New folder">
              <FolderPlus size={15} />
            </button>
            <button className="ghost-btn sm" aria-label="New note" onClick={() => createNote()}>
              <Plus size={16} />
            </button>
          </div>

          <div className="tree-scroll" ref={treeRef}>
            <PinnedSection />
            {tree.folders.map((f) => (
              <FolderRow key={f.path} folder={f} depth={0} />
            ))}
            {tree.notes.map((nt) => (
              <NoteRow key={nt.id} note={nt} />
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
