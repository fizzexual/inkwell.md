// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { appShortcut, editorShortcut, listenEscape, type KeyLike, type ShortcutState } from "./keys";

const idle: ShortcutState = { zen: false, paletteOpen: false, editing: false, centerView: "article" };

function key(k: Partial<KeyLike> & { key: string }): KeyLike {
  return {
    code: undefined,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: document.body,
    defaultPrevented: false,
    ...k,
  };
}

describe("appShortcut", () => {
  it("Ctrl+\\ toggles the sidebar", () => {
    expect(appShortcut(key({ key: "\\", code: "Backslash", ctrlKey: true }), idle)).toBe("toggleSidebar");
  });

  it("Ctrl+Shift+\\ toggles the inspector (with Shift the key reads '|')", () => {
    expect(
      appShortcut(key({ key: "|", code: "Backslash", ctrlKey: true, shiftKey: true }), idle),
    ).toBe("toggleInspector");
  });

  it("Ctrl+Y redoes in the note editor but not while typing in another field", () => {
    const editor = document.createElement("textarea");
    editor.className = "md-editor";
    const chat = document.createElement("textarea");
    expect(appShortcut(key({ key: "y", ctrlKey: true, target: document.body }), idle)).toBe("redo");
    expect(appShortcut(key({ key: "y", ctrlKey: true, target: editor }), idle)).toBe("redo");
    expect(appShortcut(key({ key: "y", ctrlKey: true, target: chat }), idle)).toBeNull();
  });

  it("Esc returns to the map from an article", () => {
    expect(appShortcut(key({ key: "Escape" }), idle)).toBe("toMap");
    expect(appShortcut(key({ key: "Escape" }), { ...idle, editing: true })).toBe("stopEditing");
  });

  it("Esc already handled by an overlay does nothing more", () => {
    expect(appShortcut(key({ key: "Escape", defaultPrevented: true }), idle)).toBeNull();
    expect(appShortcut(key({ key: "Escape", defaultPrevented: true }), { ...idle, editing: true })).toBeNull();
    expect(appShortcut(key({ key: "Escape", defaultPrevented: true }), { ...idle, zen: true })).toBeNull();
  });
});

describe("editorShortcut", () => {
  it("keeps Ctrl+B / Ctrl+I / Ctrl+F and Ctrl+K-with-selection", () => {
    expect(editorShortcut(key({ key: "b", ctrlKey: true }), 0)).toBe("bold");
    expect(editorShortcut(key({ key: "i", metaKey: true }), 0)).toBe("italic");
    expect(editorShortcut(key({ key: "f", ctrlKey: true }), 0)).toBe("find");
    expect(editorShortcut(key({ key: "k", ctrlKey: true }), 5)).toBe("inlineAi");
  });

  it("lets Ctrl+K without a selection reach the palette", () => {
    expect(editorShortcut(key({ key: "k", ctrlKey: true }), 0)).toBeNull();
  });

  it("lets Ctrl+Shift+F reach semantic search", () => {
    expect(editorShortcut(key({ key: "F", ctrlKey: true, shiftKey: true }), 0)).toBeNull();
  });

  it("lets Ctrl+Shift+K reach quick capture even with a selection", () => {
    expect(editorShortcut(key({ key: "K", ctrlKey: true, shiftKey: true }), 5)).toBeNull();
  });
});

describe("listenEscape", () => {
  it("closes the overlay and marks Esc handled before an app-level listener sees it", () => {
    const seen: boolean[] = [];
    // the app's listener is registered FIRST (App mounts before a modal opens)
    const app = (e: KeyboardEvent) => seen.push(e.defaultPrevented);
    window.addEventListener("keydown", app);
    const close = vi.fn();
    const stop = listenEscape(close);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([true]);

    // after unsubscribing, Esc is the app's again
    stop();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([true, false]);
    window.removeEventListener("keydown", app);
  });

  it("ignores other keys", () => {
    const close = vi.fn();
    const stop = listenEscape(close);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
    expect(close).not.toHaveBeenCalled();
    stop();
  });
});
