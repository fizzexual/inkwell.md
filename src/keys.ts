// App-wide keyboard shortcuts, decided by a pure function so the rules can be unit-tested.

/** The bits of a KeyboardEvent the shortcut rules look at. */
export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  defaultPrevented: boolean;
}

/** The bits of app state the shortcut rules look at. */
export interface ShortcutState {
  zen: boolean;
  paletteOpen: boolean;
  editing: boolean;
  centerView: string;
}

export type AppAction =
  | "exitZen"
  | "toggleZen"
  | "togglePalette"
  | "toggleQuick"
  | "newNote"
  | "toggleEdit"
  | "graph"
  | "back"
  | "forward"
  | "toggleInspector"
  | "toggleSidebar"
  | "toggleAi"
  | "semantic"
  | "undo"
  | "redo"
  | "shortcuts"
  | "stopEditing"
  | "toMap";

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    el?.isContentEditable === true ||
    !!el?.closest?.(".bld-input")
  );
}

/** Which app action (if any) a keydown triggers. null = not ours, let it through. */
export function appShortcut(e: KeyLike, s: ShortcutState): AppAction | null {
  const mod = e.metaKey || e.ctrlKey;
  // an overlay (palette, quick capture, a modal…) already used this Esc to close itself
  if (e.key === "Escape" && e.defaultPrevented) return null;
  if (e.key === "Escape" && s.zen) return "exitZen";
  if (mod && e.key === ".") return "toggleZen";
  if (mod && !e.shiftKey && (e.key === "p" || e.key === "k")) return "togglePalette";
  if (mod && e.shiftKey && (e.key === "k" || e.key === "K")) return "toggleQuick";
  if (mod && e.key === "n") return "newNote";
  if (mod && e.key === "e") return "toggleEdit";
  if (mod && e.key === "g") return "graph";
  if (e.altKey && e.key === "ArrowLeft") return "back";
  if (e.altKey && e.key === "ArrowRight") return "forward";
  // match the physical key: with Shift held, e.key is "|" on most layouts
  if (mod && (e.code === "Backslash" || e.key === "\\")) return e.shiftKey ? "toggleInspector" : "toggleSidebar";
  if (mod && e.key === "j") return "toggleAi";
  if (mod && e.shiftKey && (e.key === "f" || e.key === "F")) return "semantic";
  if (mod && (e.key === "z" || e.key === "Z" || e.key === "y")) {
    // let native undo/redo win inside other text fields (math sheet, search, AI chat…)
    const t = e.target as HTMLElement | null;
    if (isTyping(t) && !t?.classList.contains("md-editor")) return null;
    if (e.key === "y") return "redo";
    return e.shiftKey ? "redo" : "undo";
  }
  if (e.key === "?" && !isTyping(e.target)) return "shortcuts";
  if (e.key === "Escape" && !s.paletteOpen) {
    if (s.editing) return "stopEditing";
    if (s.centerView === "article") return "toMap";
  }
  return null;
}

/**
 * Close an overlay on Esc. Listens in the capture phase so it runs before the app-wide
 * shortcut handler (which is registered earlier, on bubble), and marks the Esc as handled so
 * the app doesn't also leave the note. Returns the unsubscribe function.
 */
export function listenEscape(close: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    close();
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}
