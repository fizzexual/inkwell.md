// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

// ---- a fake pdf.js that records what the viewer does with it ----
interface FakeRender {
  promise: Promise<void>;
  cancel: ReturnType<typeof vi.fn>;
  resolve: () => void;
}
const h = vi.hoisted(() => ({
  loads: [] as { destroy: ReturnType<typeof vi.fn>; doc: { name: string; getPage: ReturnType<typeof vi.fn> } }[],
  renders: [] as FakeRender[],
}));

function fakeDoc(name: string) {
  return {
    name,
    numPages: 3,
    getPage: vi.fn(async (n: number) => ({
      n,
      getViewport: () => ({ width: 100, height: 100 }),
      render: () => {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => (resolve = r));
        const task: FakeRender = {
          promise,
          resolve,
          cancel: vi.fn(() => resolve()),
        };
        h.renders.push(task);
        return task;
      },
      getTextContent: async () => ({ items: [] }),
    })),
  };
}

vi.mock("../pdf", () => ({
  pdfjs: {
    getDocument: ({ data }: { data: ArrayBuffer }) => {
      const name = new TextDecoder().decode(data);
      const doc = fakeDoc(name);
      const load = { destroy: vi.fn(async () => {}), doc };
      h.loads.push(load);
      return { promise: Promise.resolve(doc), destroy: load.destroy };
    },
    TextLayer: class {
      render() {
        return Promise.resolve();
      }
      cancel() {}
    },
  },
}));

// a stand-in for the app store with just what the PDF view reads
vi.mock("../store/useVault", () => {
  const useVault = create(() => ({
    pdf: null as { name: string; data: ArrayBuffer } | null,
    openPdf: () => {},
    createNoteWith: () => {},
    resolve: () => undefined,
    notesById: new Map(),
    updateContent: () => {},
    openArticle: () => {},
    toast: () => {},
  }));
  return { useVault };
});

import PdfView from "./PdfView";
import { useVault } from "../store/useVault";

const setPdf = (name: string) =>
  (useVault as unknown as { setState: (s: object) => void }).setState({
    pdf: { name: `${name}.pdf`, data: new TextEncoder().encode(name).buffer },
  });

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.loads.length = 0;
  h.renders.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: () => {},
  } as unknown as CanvasRenderingContext2D);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const click = (label: string) => {
  const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;
  act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("PdfView", () => {
  it("destroys the pdf.js document when the PDF is closed or replaced", async () => {
    setPdf("a");
    act(() => root.render(<PdfView />));
    await flush();
    setPdf("b");
    await flush();
    expect(h.loads[0].destroy).toHaveBeenCalled();
    act(() => root.unmount());
    expect(h.loads[1].destroy).toHaveBeenCalled();
    root = createRoot(host);
  });

  it("opening another PDF with the same page count renders the NEW document", async () => {
    setPdf("a");
    act(() => root.render(<PdfView />));
    await flush();
    h.renders.forEach((r) => r.resolve());
    await flush();
    setPdf("b");
    await flush();
    expect(h.loads[1].doc.getPage).toHaveBeenCalledWith(1);
  });

  it("a second zoom click cancels the render still running on the canvas", async () => {
    setPdf("a");
    act(() => root.render(<PdfView />));
    await flush();
    const first = h.renders.length;
    expect(first).toBeGreaterThan(0);
    click("+");
    await flush();
    click("+");
    await flush();
    // every render except the newest was cancelled before the next one started
    const running = h.renders.filter((r) => !r.cancel.mock.calls.length);
    expect(running.length).toBe(1);
    expect(h.renders.length).toBeGreaterThanOrEqual(3);
  });
});
