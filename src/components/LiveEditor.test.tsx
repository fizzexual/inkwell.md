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

const openPdfLink = vi.hoisted(() => vi.fn(async () => true));
const openArticle = vi.hoisted(() => vi.fn());
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
    openArticle,
    openPdfLink,
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

describe("LiveEditor page links (gap 3)", () => {
  const md = "Intro\n\n> quote\n>\n> — [p. 3](#/pdf/Attachments/My%20Paper.pdf?page=3)";
  /** a real mouse click: press, release, click — each bubbling through the rendered block */
  const clickOn = (el: Element) => {
    act(() => {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      el.dispatchEvent(ev);
    });
    return ev;
  };
  const pageLink = () => [...host.querySelectorAll("a")].find((a) => a.textContent === "p. 3")!;

  beforeEach(() => {
    openPdfLink.mockClear();
    window.location.hash = "";
  });

  it("clicking p. 3 opens the PDF at page 3, never just the URL hash, and doesn't open the block for editing", async () => {
    await show(md);
    expect(pageLink()).toBeTruthy();
    const ev = clickOn(pageLink());
    await flush();
    expect(openPdfLink).toHaveBeenCalledWith("Attachments/My Paper.pdf", 3);
    expect(ev.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe("");
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("works while another block is being edited", async () => {
    await show(md);
    clickOn(host.querySelector(".live-block")!); // "Intro" opens for editing
    await flush();
    expect(host.querySelector("textarea")).not.toBeNull();
    const ev = clickOn(pageLink());
    await flush();
    expect(openPdfLink).toHaveBeenCalledWith("Attachments/My Paper.pdf", 3);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("a click on the block's text (not the link) still opens it for editing", async () => {
    await show(md);
    clickOn(host.querySelectorAll(".live-block")[1]);
    await flush();
    expect(host.querySelector("textarea")?.value).toContain("[p. 3]");
    expect(openPdfLink).not.toHaveBeenCalled();
  });
});
