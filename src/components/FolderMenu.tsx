import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { placeMenu } from "../placeMenu";
import { useVault } from "../store/useVault";
import { createFolderFlow, deleteFolderFlow } from "../vault/sync";
import { allFolderPaths, freeFolderName } from "../folders";
import { Doc, FolderPlus, Pencil, Palette, Trash } from "../icons";
import { listenEscape } from "../keys";
import "./ContextMenu.css";
import "./FolderMenu.css";

interface Item {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** Make a "New folder" inside `parent` and put its name straight into inline editing. */
export async function newFolderIn(parent: string) {
  const s = useVault.getState();
  const path = freeFolderName(allFolderPaths(s.notes.map((n) => n.folder), s.folders), parent);
  const err = await createFolderFlow(path);
  if (err) {
    s.toast(`Couldn't make the folder: ${err}`);
    return;
  }
  const now = useVault.getState();
  if (parent && !now.expanded.has(parent)) now.toggleFolder(parent);
  now.setRenamingFolder(path);
}

/** Right-click menu on a sidebar folder. */
export default function FolderMenu() {
  const menu = useVault((s) => s.folderMenu);
  const close = useVault((s) => s.closeFolderMenu);
  const createNote = useVault((s) => s.createNote);
  const setRenaming = useVault((s) => s.setRenamingFolder);
  const openPicker = useVault((s) => s.openPicker);
  const toast = useVault((s) => s.toast);
  const onDisk = useVault((s) => !!s.loadedVault);
  const count = useVault((s) => (s.folderMenu ? s.notesIn(s.folderMenu.path) : 0));
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 224, h: 220 });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && (r.width !== size.w || r.height !== size.h)) setSize({ w: r.width, h: r.height });
  }, [menu, confirming, size.w, size.h]);

  useEffect(() => setConfirming(false), [menu]);
  useEffect(() => {
    if (!menu) return;
    const onDown = () => close();
    window.addEventListener("pointerdown", onDown);
    const stopEsc = listenEscape(close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      stopEsc();
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;
  const { path } = menu;
  const name = path.slice(path.lastIndexOf("/") + 1);

  const remove = async () => {
    close();
    const err = await deleteFolderFlow(path);
    if (err) toast(`Couldn't delete “${name}”: ${err}`);
  };
  const notes = `${count} note${count === 1 ? "" : "s"}`;
  const question = onDisk ? `Move folder and ${notes} to the Recycle Bin?` : `Delete folder and ${notes}?`;

  const items: (Item | "sep")[] = [
    {
      icon: <Doc size={15} />,
      label: "New note here",
      onClick: () => {
        close();
        createNote(path);
      },
    },
    {
      icon: <FolderPlus size={15} />,
      label: "New subfolder",
      onClick: () => {
        close();
        void newFolderIn(path);
      },
    },
    { icon: <Pencil size={15} />, label: "Rename", onClick: () => setRenaming(path) },
    {
      icon: <Palette size={15} />,
      label: "Set colour…",
      onClick: () => {
        close();
        openPicker(menu.x, menu.y, "color", path);
      },
    },
    "sep",
    {
      icon: <Trash size={15} />,
      label: onDisk ? "Delete folder (to Recycle Bin)" : "Delete folder",
      danger: true,
      // a folder holding notes asks first; an empty one goes at once
      onClick: () => (count ? setConfirming(true) : void remove()),
    },
  ];

  const { left, top } = placeMenu(menu.x, menu.y, size.w, size.h, window.innerWidth, window.innerHeight);

  return (
    <div ref={ref} className="ctx-menu" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ctx-title">{name}</div>
      {confirming ? (
        <div className="ctx-confirm">
          <p>{question}</p>
          <div className="ctx-confirm-row">
            <button className="ctx-item" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button className="ctx-item danger strong" onClick={() => void remove()} autoFocus>
              <Trash size={15} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      ) : (
        items.map((it, i) =>
          it === "sep" ? (
            <div className="ctx-sep" key={i} />
          ) : (
            <button key={i} className={"ctx-item" + (it.danger ? " danger" : "")} onClick={it.onClick}>
              {it.icon}
              <span>{it.label}</span>
            </button>
          ),
        )
      )}
    </div>
  );
}
