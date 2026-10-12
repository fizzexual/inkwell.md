// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

vi.mock("./KnowledgeGraph", () => ({ default: () => null }));

const reveal = vi.hoisted(() => ({ calls: [] as (number | null)[] }));
vi.mock("../store/useVault", () => {
  const useVault = create(() => ({
    requestFit: () => {},
    graphLocal: false,
    graphColorFolder: false,
    toggleGraphLocal: () => {},
    toggleGraphColorFolder: () => {},
    graph: { nodes: [{ id: "a", folder: "" }, { id: "b", folder: "" }], links: [] },
    graphFilter: "",
    setGraphFilter: () => {},
    setGraphReveal: (n: number | null) => reveal.calls.push(n),
    vaultPath: null as string | null,
    tree: { name: "Inkwell Guide" },
  }));
  return { useVault };
});

import KnowledgeMap from "./KnowledgeMap";
import { useVault } from "../store/useVault";
const setState = (s: object) => (useVault as unknown as { setState: (s: object) => void }).setState(s);

let root: Root;
let host: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  reveal.calls.length = 0;
  frames = new Map();
  let id = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.set(++id, cb);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((h) => void frames.delete(h));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const runFrames = (now: number) => {
  const due = [...frames.values()];
  frames.clear();
  due.forEach((cb) => cb(now));
};
const subtitle = () => host.querySelector(".map-subtitle")?.textContent;

describe("KnowledgeMap", () => {
  it("names the open vault folder, else the built-in vault", () => {
    setState({ vaultPath: null });
    act(() => root.render(<KnowledgeMap />));
    expect(subtitle()).toBe("Inkwell Guide");
    act(() => setState({ vaultPath: "D:\\Notes\\Research vault\\" }));
    expect(subtitle()).toBe("Research vault");
    act(() => setState({ vaultPath: "/home/me/phd" }));
    expect(subtitle()).toBe("phd");
  });

  it("stops the replay animation when the map closes", () => {
    act(() => root.render(<KnowledgeMap />));
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Replay"))!;
    act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    runFrames(performance.now() + 100);
    expect(reveal.calls.at(-1)).not.toBeNull(); // mid-animation
    act(() => root.unmount());
    // the graph is not left half-revealed: the reveal is cleared on close…
    expect(reveal.calls.at(-1)).toBeNull();
    // …and no frame keeps animating afterwards
    const after = reveal.calls.length;
    runFrames(performance.now() + 200);
    expect(reveal.calls.length).toBe(after);
    root = createRoot(host);
  });
});
