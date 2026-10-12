// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg class="fake-diagram"></svg>' })),
  },
}));

const NOTES = vi.hoisted(() => [
  { id: "a", title: "Alpha", folder: "", kind: "note", links: [], content: "# Alpha\n#ml" },
  { id: "src", title: "Deep Learning", folder: "Sources", kind: "source", links: [], content: "---\ncitekey: lecun2015\n---\n# Deep Learning" },
]);

vi.mock("../store/useVault", () => {
  const notesById = new Map(NOTES.map((n) => [n.id, n]));
  const useVault = create(() => ({
    notes: NOTES,
    notesById,
    resolve: (t: string) => NOTES.find((n) => n.title === t)?.id,
    citeMap: new Map([
      ["lecun2015", { id: "src", key: "lecun2015", label: "LeCun 2015", authors: "LeCun", year: "2015", title: "Deep Learning" }],
    ]),
    openArticle: () => {},
    theme: "light",
  }));
  return { useVault };
});

import LiveEditor from "./LiveEditor";

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  });

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

const show = async (md: string) => {
  act(() => root.render(<LiveEditor value={md} onChange={() => {}} noteId="a" />));
  await flush();
};

describe("LiveEditor renders the same blocks as reading view", () => {
  it("runs ```query blocks", async () => {
    await show("Intro\n\n```query\nlist from #ml\n```");
    expect(host.querySelector(".inkql")).not.toBeNull();
    expect(host.querySelector("code.language-query")).toBeNull();
  });

  it("renders ```bibliography blocks", async () => {
    await show("As shown [@lecun2015].\n\n```bibliography\n```");
    expect(host.querySelector("code.language-bibliography")).toBeNull();
    expect(host.textContent).toContain("Deep Learning");
  });

  it("draws ```mermaid diagrams", async () => {
    await show("```mermaid\ngraph TD; A-->B\n```");
    expect(host.querySelector(".mermaid-src.mermaid-done svg.fake-diagram")).not.toBeNull();
  });

  it("keeps a drawn diagram while typing in a block above it (no redraw per keystroke)", async () => {
    const { default: mermaid } = await import("mermaid");
    const render = vi.mocked(mermaid.render);
    function Harness() {
      const [md, setMd] = useState("Typing here\n\n```mermaid\ngraph TD; A-->B\n```");
      return <LiveEditor value={md} onChange={setMd} noteId="a" />;
    }
    act(() => root.render(<Harness />));
    await flush();
    const calls = render.mock.calls.length;
    // click the first block to edit it, then type twice
    act(() => {
      host.querySelector(".live-block")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await flush();
    const ta = host.querySelector("textarea")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    for (const text of ["Typing here!", "Typing here!!"]) {
      act(() => {
        setValue.call(ta, text);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await flush();
    }
    expect(host.querySelector("textarea")!.value).toBe("Typing here!!");
    expect(host.querySelector(".mermaid-src.mermaid-done svg.fake-diagram")).not.toBeNull();
    // drawn once more at most when the editor opened (the block moved below the textarea), never per keystroke
    expect(render.mock.calls.length).toBeLessThanOrEqual(calls + 1);
  });
});
