// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useVault } from "../store/useVault";
import CommandPalette from "./CommandPalette";
import QuickCapture from "./QuickCapture";
import SemanticSearch from "./SemanticSearch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
});

function mount(el: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}

/** Esc pressed while focus is NOT in the overlay's input (it was clicked away, or focus hadn't landed yet) */
function escapeFromBody() {
  (document.activeElement as HTMLElement | null)?.blur();
  const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    document.body.dispatchEvent(ev);
  });
  return ev;
}

describe("overlays close on Esc wherever focus is", () => {
  it("command palette", () => {
    act(() => useVault.setState({ paletteOpen: true }));
    mount(<CommandPalette />);
    const ev = escapeFromBody();
    expect(useVault.getState().paletteOpen).toBe(false);
    expect(ev.defaultPrevented).toBe(true); // so App doesn't also leave the note
  });

  it("quick capture", () => {
    act(() => useVault.setState({ quickOpen: true }));
    mount(<QuickCapture />);
    escapeFromBody();
    expect(useVault.getState().quickOpen).toBe(false);
  });

  it("semantic search", () => {
    act(() => useVault.setState({ semanticOpen: true }));
    mount(<SemanticSearch />);
    escapeFromBody();
    expect(useVault.getState().semanticOpen).toBe(false);
  });
});
