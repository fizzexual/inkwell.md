import { useMemo, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import type { SidebarView } from "../store/useVault";
import type { TreeFolder, TreeNote } from "../data/derive";
import type { Note } from "../data/vault";
import { TEMPLATES } from "../templates";
import { NoteIcon } from "../noteIcons";
import { openPdfFile } from "../pdfOpen";
import { openVaultFolderFlow, renameFolderFlow } from "../vault/sync";
import { backupNowFlow } from "../vault/backup";
import { useGitHistory, setGitHistoryFlow, commitNowFlow } from "../vault/gitHistory";
import FolderMenu, { newFolderIn } from "./FolderMenu";
import BackupModal from "./BackupModal";
import { FolderOpen, Download, X as CloseX, Mic, Archive, ArchiveRestore, GitBranch, GitCommitHorizontal, Check } from "lucide-react";
import { useSmoothScroll } from "../useSmoothScroll";
import { vaultName, withFolders } from "../folders";
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

function NoteRow({ note }: { note: TreeNote }) {
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
      {icon ? <NoteIcon name={icon} size={15} className="tree-icon note-ico" /> : <Doc className="tree-icon doc" size={15} />}
      <span className="tree-label">{note.title}</span>
    </button>
  );
}

const NOTE_DRAG = "text/inkwell-note";
const FOLDER_DRAG = "text/inkwell-folder";
const canDrop = (e: React.DragEvent) =>
  e.dataTransfer.types.includes(NOTE_DRAG) || e.dataTransfer.types.includes(FOLDER_DRAG);

/** Move folder `from` into `parent` ("" = the vault root), keeping its name. */
async function moveFolderInto(from: string, parent: string) {
  const name = from.slice(from.lastIndexOf("/") + 1);
  const to = parent ? `${parent}/${name}` : name;
  if (to === from) return;
  const err = await renameFolderFlow(from, to);
  if (err) useVault.getState().toast(`Couldn't move “${name}”: ${err}`);
}

/** A note or folder dropped on `target` ("" = the vault root). */
function dropInto(e: React.DragEvent, target: string) {
  const note = e.dataTransfer.getData(NOTE_DRAG);
  const folder = e.dataTransfer.getData(FOLDER_DRAG);
  if (note) useVault.getState().moveNote(note, target);
  else if (folder) void moveFolderInto(folder, target);
}

/** The folder's name as an input: Enter or leaving it saves, Esc cancels. */
function FolderRename({ folder, depth }: { folder: TreeFolder; depth: number }) {
  const setRenaming = useVault((s) => s.setRenamingFolder);
  const [value, setValue] = useState(folder.name);
  const done = useRef(false);
  const commit = async () => {
    if (done.current) return;
    done.current = true;
    setRenaming(null);
    const name = value.trim();
    if (!name || name === folder.name) return;
    const toast = useVault.getState().toast;
    if (name.includes("/")) {
      toast("A folder name can't contain /");
      return;
    }
    const parent = folder.path.includes("/") ? folder.path.slice(0, folder.path.lastIndexOf("/")) : "";
    const err = await renameFolderFlow(folder.path, parent ? `${parent}/${name}` : name);
    if (err) toast(`Couldn't rename “${folder.name}”: ${err}`);
  };
  return (
    <div className="tree-item folder renaming" style={{ paddingLeft: 8 + depth * 14 }}>
      <span className="chev" />
      <Folder className="tree-icon" size={15} />
      <input
        className="tree-rename"
        aria-label="Folder name"
        value={value}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            done.current = true;
            setRenaming(null);
          }
        }}
        onBlur={() => void commit()}
      />
    </div>
  );
}

function FolderRow({ folder, depth }: { folder: TreeFolder; depth: number }) {
  const expanded = useVault((s) => s.expanded);
  const toggle = useVault((s) => s.toggleFolder);
  const openFolderMenu = useVault((s) => s.openFolderMenu);
  const renaming = useVault((s) => s.renamingFolder === folder.path);
  const color = useVault((s) => s.folderColors[folder.path]);
  const [dropping, setDropping] = useState(false);
  const open = expanded.has(folder.path);
  return (
    <div className="tree-folder">
      {renaming ? (
        <FolderRename folder={folder} depth={depth} />
      ) : (
        <button
          className={"tree-item folder" + (dropping ? " drop-target" : "")}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData(FOLDER_DRAG, folder.path);
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => toggle(folder.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            openFolderMenu(e.clientX, e.clientY, folder.path);
          }}
          onDragOver={(e) => {
            if (canDrop(e)) {
              e.preventDefault();
              e.stopPropagation();
              setDropping(true);
            }
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropping(false);
            dropInto(e, folder.path);
          }}
          title={folder.name}
        >
          <span className={"chev" + (open ? " open" : "")}>
            <ChevronRight size={13} />
          </span>
          <Folder className="tree-icon" size={15} style={color ? { color } : undefined} />
          <span className="tree-label">{folder.name}</span>
        </button>
      )}
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

/** The vault name's menu: open another folder; for a disk vault, back up, restore, and git history. */
function VaultMenu({ x, y, onClose, onRestore }: { x: number; y: number; onClose: () => void; onRestore: () => void }) {
  const onDisk = useVault((s) => !!s.loadedVault);
  const loadedVault = useVault((s) => s.loadedVault);
  const gitOn = useGitHistory((s) => !!loadedVault && s.vaults.includes(loadedVault));
  const branch = useGitHistory((s) => s.info?.branch);
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <>
      <div className="tpl-overlay" onClick={onClose} />
      <div className="ctx-menu" style={{ left: x, top: y }}>
        <button className="ctx-item" onClick={run(openVaultFolderFlow)}>
          <FolderOpen size={15} />
          <span>Open a vault folder…</span>
        </button>
        {onDisk && (
          <>
            <div className="ctx-sep" />
            <button className="ctx-item" onClick={run(() => void backupNowFlow())}>
              <Archive size={15} />
              <span>Back up now</span>
            </button>
            <button className="ctx-item" onClick={run(onRestore)}>
              <ArchiveRestore size={15} />
              <span>Restore a backup…</span>
            </button>
            <div className="ctx-sep" />
            <button
              className="ctx-item"
              role="menuitemcheckbox"
              aria-checked={gitOn}
              onClick={run(() => void setGitHistoryFlow(!gitOn))}
              title="Commit this vault's notes and attachments to a git repository in the vault folder (never pushed anywhere)"
            >
              <GitBranch size={15} />
              <span>Keep git history{gitOn && branch ? ` · ${branch}` : ""}</span>
              {gitOn && <Check size={14} style={{ marginLeft: "auto" }} />}
            </button>
            {gitOn && (
              <button className="ctx-item" onClick={run(() => void commitNowFlow())}>
                <GitCommitHorizontal size={15} />
                <span>Commit now</span>
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function Sidebar() {
  const noteTree = useVault((s) => s.tree);
  const folders = useVault((s) => s.folders);
  const tree = useMemo(() => withFolders(noteTree, folders), [noteTree, folders]);
  const sidebarView = useVault((s) => s.sidebarView);
  const setSidebarView = useVault((s) => s.setSidebarView);
  const createNote = useVault((s) => s.createNote);
  const createNoteWith = useVault((s) => s.createNoteWith);
  const setAllFolders = useVault((s) => s.setAllFolders);
  const setClipOpen = useVault((s) => s.setClipOpen);
  const setImportOpen = useVault((s) => s.setImportOpen);
  const setTranscribeOpen = useVault((s) => s.setTranscribeOpen);
  const vaultPath = useVault((s) => s.vaultPath);
  const closeVault = useVault((s) => s.closeVault);
  const anyExpanded = useVault((s) => s.expanded.size > 0);
  const width = useVault((s) => s.sidebarWidth);
  const treeRef = useRef<HTMLDivElement>(null);
  useSmoothScroll(treeRef);
  const [tplOpen, setTplOpen] = useState(false);
  const [vaultMenu, setVaultMenu] = useState<{ x: number; y: number } | null>(null);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [dropRoot, setDropRoot] = useState(false);

  const onImportPdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) openPdfFile(file); // copies it into the vault's Attachments/ when a folder vault is open
    e.target.value = "";
  };

  return (
    <aside className="sidebar" style={{ width, minWidth: width }}>
      <div className="vault-header">
        <button
          className="vault-name"
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setVaultMenu({ x: r.left, y: r.bottom + 4 });
          }}
          title="Vault: open a folder, back up, restore, git history"
        >
          <span>{vaultName(vaultPath, tree.name)}</span>
          <ChevronDown size={14} className="vault-caret" />
        </button>
        <div className="vault-actions">
          {vaultPath ? (
            <button className="ghost-btn" aria-label="Close vault" title="Back to the demo vault" onClick={closeVault}>
              <CloseX size={15} />
            </button>
          ) : (
            <button
              className="ghost-btn"
              aria-label="Open vault folder"
              title="Open a folder of .md files as your vault"
              onClick={openVaultFolderFlow}
            >
              <FolderOpen size={15} />
            </button>
          )}
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
            <button
              className="ghost-btn sm"
              aria-label="Import notes or sources"
              title="Import Markdown / Obsidian / Notion / BibTeX / DOI"
              onClick={() => setImportOpen(true)}
            >
              <Download size={15} />
            </button>
            <button
              className="ghost-btn sm"
              aria-label="Transcribe audio"
              title="Transcribe an audio file to a note (on-device)"
              onClick={() => setTranscribeOpen(true)}
            >
              <Mic size={15} />
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
            <button className="ghost-btn sm" aria-label="New folder" title="New folder" onClick={() => void newFolderIn("")}>
              <FolderPlus size={15} />
            </button>
            <button className="ghost-btn sm" aria-label="New note" onClick={() => createNote()}>
              <Plus size={16} />
            </button>
          </div>

          <div
            className={"tree-scroll" + (dropRoot ? " drop-root" : "")}
            ref={treeRef}
            // dropped on the empty space below the tree: to the vault root
            onDragOver={(e) => {
              if (e.target === e.currentTarget && canDrop(e)) {
                e.preventDefault();
                setDropRoot(true);
              }
            }}
            onDragLeave={() => setDropRoot(false)}
            onDrop={(e) => {
              setDropRoot(false);
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              dropInto(e, "");
            }}
          >
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
      <FolderMenu />
      {vaultMenu && (
        <VaultMenu
          x={vaultMenu.x}
          y={vaultMenu.y}
          onClose={() => setVaultMenu(null)}
          onRestore={() => setBackupsOpen(true)}
        />
      )}
      {backupsOpen && <BackupModal onClose={() => setBackupsOpen(false)} />}
    </aside>
  );
}
