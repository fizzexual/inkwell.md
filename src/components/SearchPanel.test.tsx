// @vitest-environment jsdom
// A search that matches thousands of notes must not render thousands of rows at once.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SearchPanel from "./SearchPanel";
import { useVault } from "../store/useVault";
import type { Note } from "../data/vault";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const notes: Note[] = Array.from({ length: 250 }, (_, i) => ({
  id: `n${i}.md`,
  title: `Note ${i}`,
  folder: "",
  kind: "note",
  links: [],
  content: `# Note ${i}\n\nshared word zebra ${i % 2 ? "#odd" : "#even"}`,
}));

function show(query: string) {
  act(() => {
    useVault.getState().loadDiskVault("v", notes);
    useVault.setState({ searchQuery: query });
  });
  act(() => root.render(<SearchPanel />));
}
const rows = () => host.querySelectorAll(".search-hit").length;

describe("SearchPanel", () => {
  it("shows the first 100 hits with the true count, and more on request", () => {
    show("zebra");
    expect(host.querySelector(".search-count")!.textContent).toBe("250 results");
    expect(rows()).toBe(100);
    const more = [...host.querySelectorAll("button")].find((b) => b.textContent === "Show 100 more")!;
    act(() => more.click());
    expect(rows()).toBe(200);
    const rest = [...host.querySelectorAll("button")].find((b) => b.textContent === "Show 50 more")!;
    act(() => rest.click());
    expect(rows()).toBe(250);
    expect([...host.querySelectorAll("button")].some((b) => /^Show \d+ more$/.test(b.textContent ?? ""))).toBe(false);
  });

  it("starts from 100 again for a new query", () => {
    show("zebra");
    act(() => [...host.querySelectorAll("button")].find((b) => b.textContent === "Show 100 more")!.click());
    act(() => useVault.setState({ searchQuery: "shared" }));
    expect(rows()).toBe(100);
  });

  it("lists every tag with how many notes carry it", () => {
    show("");
    const tags = [...host.querySelectorAll(".tag-row")].map((r) => r.textContent);
    expect(tags).toEqual(["#even125", "#odd125"]);
  });
});
