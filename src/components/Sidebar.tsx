import { useVault } from "../store/useVault";
import type { SidebarView } from "../store/useVault";
import type { TreeFolder } from "../data/derive";
import type { Note } from "../data/vault";
import SearchPanel from "./SearchPanel";
import StatsPanel from "./StatsPanel";
import {
  BarChart,
  NoteEdit,
  Graph,
  Search,
  Tag,
  Import,
  FolderPlus,
  Plus,
  Pencil,
  ChevronDown,
  ChevronRight,
  Folder,
  Doc,
} from "../icons";
import "./Sidebar.css";

const VIEWS: { id: SidebarView; Icon: typeof BarChart; label: string }[] = [
  { id: "stats", Icon: BarChart, label: "Overview" },
  { id: "notes", Icon: NoteEdit, label: "Notes" },
  { id: "graph", Icon: Graph, label: "Knowledge map" },
  { id: "search", Icon: Search, label: "Search" },
];

function NoteRow({ note }: { note: Note }) {
  const selectedId = useVault((s) => s.selectedId);
  const openArticle = useVault((s) => s.openArticle);
  const active = note.id === selectedId;
  return (
    <button
      className={"tree-item note" + (active ? " active" : "")}
      onClick={() => openArticle(note.id)}
      title={note.title}
    >
      <Doc className="tree-icon doc" size={15} />
      <span className="tree-label">{note.title}</span>
    </button>
  );
}

function FolderRow({ folder, depth }: { folder: TreeFolder; depth: number }) {
  const expanded = useVault((s) => s.expanded);
  const toggle = useVault((s) => s.toggleFolder);
  const open = expanded.has(folder.path);
  return (
    <div className="tree-folder">
      <button
        className="tree-item folder"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => toggle(folder.path)}
        title={folder.name}
      >
        <span className="chev">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <Folder className="tree-icon" size={15} />
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

export default function Sidebar() {
  const tree = useVault((s) => s.tree);
  const sidebarView = useVault((s) => s.sidebarView);
  const setSidebarView = useVault((s) => s.setSidebarView);

  return (
    <aside className="sidebar">
      <div className="vault-header">
        <button className="vault-name">
          <span>{tree.name}</span>
          <ChevronDown size={14} className="vault-caret" />
        </button>
        <div className="vault-actions">
          <button className="ghost-btn" aria-label="Edit vault">
            <Pencil size={15} />
          </button>
          <button className="ghost-btn" aria-label="New note">
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
            <button className="ghost-btn sm" aria-label="Tags">
              <Tag size={15} />
            </button>
            <button className="ghost-btn sm" aria-label="Import source">
              <Import size={15} />
            </button>
            <button className="ghost-btn sm" aria-label="New folder">
              <FolderPlus size={15} />
            </button>
            <button className="ghost-btn sm" aria-label="New note">
              <Plus size={16} />
            </button>
          </div>

          <div className="tree-scroll">
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
