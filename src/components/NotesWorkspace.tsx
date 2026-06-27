import { useVault } from "../store/useVault";
import ArticleView from "./ArticleView";
import { Plus } from "../icons";
import "./NotesWorkspace.css";

function TabBar({ paneIdx }: { paneIdx: number }) {
  const pane = useVault((s) => s.panes[paneIdx]);
  const notesById = useVault((s) => s.notesById);
  const activePane = useVault((s) => s.activePane);
  const activateTab = useVault((s) => s.activateTab);
  const closeTab = useVault((s) => s.closeTab);
  const openMenu = useVault((s) => s.openMenu);
  const createNote = useVault((s) => s.createNote);

  if (!pane) return null;

  return (
    <div className={"tab-bar" + (paneIdx === activePane ? " active-pane" : "")}>
      <div className="tab-strip">
        {pane.tabs.map((id) => {
          const note = notesById.get(id);
          if (!note) return null;
          const active = id === pane.active && paneIdx === activePane;
          return (
            <div
              key={id}
              className={"tab" + (id === pane.active ? " active" : "") + (active ? " focused" : "")}
              onMouseDown={() => activateTab(paneIdx, id)}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, id);
              }}
              title={note.title}
            >
              <span className="tab-label">{note.title}</span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(paneIdx, id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button className="tab-new" title="New note" onClick={() => createNote()}>
        <Plus size={15} />
      </button>
    </div>
  );
}

export default function NotesWorkspace() {
  const panes = useVault((s) => s.panes);
  const activePane = useVault((s) => s.activePane);
  const setActivePane = useVault((s) => s.setActivePane);

  return (
    <div className="notes-workspace">
      {panes.map((pane, idx) => (
        <div
          key={idx}
          className={"workspace-pane" + (idx === activePane ? " active" : "")}
          onMouseDownCapture={() => idx !== activePane && setActivePane(idx)}
        >
          <TabBar paneIdx={idx} />
          <ArticleView noteId={pane.active} isActive={idx === activePane} />
        </div>
      ))}
    </div>
  );
}
