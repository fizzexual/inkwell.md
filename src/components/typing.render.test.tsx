// @vitest-environment jsdom
// Typing in one note must not re-render (or re-run the queries of) every other open note.
import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({ renderMarkdown: vi.fn(), runQuery: vi.fn() }));
vi.mock("../markdown", async (orig) => {
  const real = await orig<typeof import("../markdown")>();
  spies.renderMarkdown.mockImplementation(real.renderMarkdown);
  return { ...real, renderMarkdown: spies.renderMarkdown };
});
vi.mock("../dataview", async (orig) => {
  const real = await orig<typeof import("../dataview")>();
  spies.runQuery.mockImplementation(real.runQuery);
  return { ...real, runQuery: spies.runQuery };
});

vi.mock("../search/semantic", () => ({
  relatedNotes: async () => [],
  isIndexWarm: () => false,
  whenIndexLoaded: () => new Promise(() => {}),
}));

import ArticleView from "./ArticleView";
import Inspector from "./Inspector";
import { useVault } from "../store/useVault";
import type { Note } from "../data/vault";

const note = (id: string, title: string, content: string): Note => ({
  id,
  title,
  folder: "",
  kind: "note",
  links: [],
  content,
});
const A = "# Alpha\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
const VAULT = [
  note("a.md", "Alpha", A),
  note("b.md", "Beta", "# Beta\n\nUnrelated prose with [[Gamma]]."),
  note("c.md", "Gamma", "# Gamma\n\n![[Alpha]]"),
  note("q.md", "Query", "# Query\n\n```query\ntag: ml\n```"),
];

let root: Root;
let host: HTMLDivElement;
const renders = new Map<string, number>();
const onRender = (id: string) => renders.set(id, (renders.get(id) ?? 0) + 1);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    useVault.getState().loadDiskVault("v", VAULT.map((n) => ({ ...n })));
    useVault.setState({ editing: false, editorMode: "source" });
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  renders.clear();
  spies.renderMarkdown.mockClear();
  spies.runQuery.mockClear();
});

/** Reading panes on these notes, plus note `active` in the active pane. */
function mount(readers: string[], active = "a.md") {
  act(() =>
    root.render(
      <>
        <ArticleView noteId={active} isActive />
        {readers.map((id) => (
          <Profiler key={id} id={id} onRender={onRender}>
            <div data-pane={id}>
              <ArticleView noteId={id} isActive={false} />
            </div>
          </Profiler>
        ))}
      </>,
    ),
  );
  renders.clear();
  spies.renderMarkdown.mockClear();
  spies.runQuery.mockClear();
}
const type = (id: string, md: string) => act(() => useVault.getState().updateContent(id, md));
const pane = (id: string) => host.querySelector(`[data-pane="${id}"]`)!;

describe("typing in a note", () => {
  it("does not re-render a reading pane on an unrelated note", () => {
    mount(["b.md"]);
    type("a.md", A + " More words.");
    expect(renders.get("b.md") ?? 0).toBe(0);
    expect(spies.renderMarkdown).toHaveBeenCalledTimes(1); // only Alpha's own reading view
  });

  it("does re-render a pane that embeds the note, showing the new text", () => {
    mount(["c.md"]);
    type("a.md", A.replace("First paragraph.", "Freshly typed words."));
    expect(renders.get("c.md")).toBeGreaterThan(0);
    expect(pane("c.md").textContent).toContain("Freshly typed words.");
  });

  it("re-runs a ```query only when something a query can see changed", () => {
    mount(["q.md"]);
    expect(pane("q.md").textContent).not.toContain("Alpha");
    type("a.md", A + " More words.");
    expect(spies.runQuery).not.toHaveBeenCalled();
    type("a.md", A + " More words. #ml");
    expect(spies.runQuery).toHaveBeenCalledTimes(1);
    expect(pane("q.md").textContent).toContain("Alpha");
  });

  it("does not render the hidden preview of the note being edited in source mode", () => {
    act(() => useVault.setState({ editing: true, editorMode: "source" }));
    mount([]);
    type("a.md", A + " x");
    type("a.md", A + " xy");
    expect(spies.renderMarkdown).not.toHaveBeenCalled();
  });

  it("in live mode re-renders only the block being typed in, not the whole note", () => {
    act(() => useVault.setState({ editing: true, editorMode: "live" }));
    mount([]);
    const blocks = host.querySelectorAll<HTMLElement>(".live-block");
    expect(blocks.length).toBe(4);
    act(() => blocks[2].dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    const ta = host.querySelector<HTMLTextAreaElement>("textarea.live-active")!;
    spies.renderMarkdown.mockClear();
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    for (const text of ["Second paragraph!", "Second paragraph!!"]) {
      act(() => {
        setValue.call(ta, text);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(useVault.getState().notesById.get("a.md")!.content).toContain("Second paragraph!!");
    expect(spies.renderMarkdown).not.toHaveBeenCalled();
  });

  it("keeps the inspector's unlinked mentions current as you type", () => {
    act(() => useVault.getState().openArticle("a.md"));
    act(() => root.render(<Inspector />));
    expect(host.textContent).not.toContain("Unlinked mentions");
    type("a.md", A + " Then gamma appears.");
    expect(host.textContent).toContain("Unlinked mentions (1)");
    expect(host.querySelector(".mention-open")!.textContent).toBe("Gamma");
    type("a.md", A + " Then [[Gamma]] appears.");
    expect(host.textContent).not.toContain("Unlinked mentions");
  });
});
