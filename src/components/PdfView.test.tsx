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

const io = vi.hoisted(() => ({ desktop: false, writeAttachment: vi.fn() }));
vi.mock("../vault/disk", () => ({ isTauri: () => io.desktop }));
vi.mock("../vault/attachments", () => ({ writeAttachment: io.writeAttachment, readAttachment: vi.fn() }));

// a stand-in for the app store with just what the PDF view reads
vi.mock("../store/useVault", () => {
  const useVault = create(() => ({
    pdf: null as { name: string; data: ArrayBuffer; rel?: string | null } | null,
    pdfTarget: null as { page: number; n: number } | null,
    pdfRel: null as string | null,
    loadedVault: null as string | null,
    openPdf: vi.fn(),
    openPdfLink: vi.fn(async () => true),
    createNoteWith: vi.fn(),
    resolve: () => undefined,
    notesById: new Map(),
    updateContent: vi.fn(),
    openArticle: () => {},
    toast: vi.fn(),
  }));
  return { useVault };
});

import PdfView from "./PdfView";
import { useVault } from "../store/useVault";

const setState = (s: object) => (useVault as unknown as { setState: (s: object) => void }).setState(s);
const state = () => useVault.getState() as unknown as Record<string, ReturnType<typeof vi.fn>>;
const setPdf = (name: string, extra: object = {}) =>
  setState({
    pdf: { name: `${name}.pdf`, data: new TextEncoder().encode(name).buffer, ...extra },
  });

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  io.desktop = false;
  io.writeAttachment.mockReset();
  setState({ pdf: null, pdfTarget: null, pdfRel: null, loadedVault: null });
  for (const k of ["openPdf", "openPdfLink", "createNoteWith", "updateContent", "toast"]) state()[k].mockClear();
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

  it("opens at the page a page link asked for", async () => {
    setState({ pdfTarget: { page: 3, n: 1 } });
    setPdf("a", { rel: "Attachments/a.pdf" });
    act(() => root.render(<PdfView />));
    await flush();
    expect(h.loads[0].doc.getPage).toHaveBeenLastCalledWith(3);
    expect(host.textContent).toContain("3 / 3");
  });

  it("a new page link for the open PDF jumps there", async () => {
    setPdf("a", { rel: "Attachments/a.pdf" });
    act(() => root.render(<PdfView />));
    await flush();
    act(() => setState({ pdfTarget: { page: 2, n: 7 } }));
    await flush();
    expect(h.loads[0].doc.getPage).toHaveBeenLastCalledWith(2);
    expect(h.loads.length).toBe(1); // same document, not reloaded
  });

  it("sizes the selectable text layer like the drawn page (pdf.js needs --total-scale-factor)", async () => {
    // without it pdf.js' text-layer CSS falls back to a smaller font, so the invisible selectable
    // text was ~55% of the drawn text and mouse selection grabbed the wrong words
    setPdf("a");
    act(() => root.render(<PdfView />));
    await flush();
    h.renders.forEach((r) => r.resolve());
    await flush();
    const layer = host.querySelector<HTMLElement>(".textLayer")!;
    const scale = layer.style.getPropertyValue("--scale-factor");
    expect(scale).not.toBe("");
    expect(layer.style.getPropertyValue("--total-scale-factor")).toBe(scale);
  });

  it("saving a highlight writes a link back to that page of the vault file", async () => {
    setPdf("My Paper", { rel: "Attachments/My Paper.pdf" });
    act(() => root.render(<PdfView />));
    await flush();
    const layer = host.querySelector(".textLayer")!;
    layer.textContent = "a quoted  sentence";
    const range = document.createRange();
    range.selectNodeContents(layer);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    click("Save highlight");
    const [title, body, folder] = state().createNoteWith.mock.calls[0];
    expect(title).toBe("My Paper — Highlights");
    expect(folder).toBe("Highlights");
    expect(body).toContain("_Source: [My Paper.pdf](#/pdf/Attachments/My%20Paper.pdf)_");
    expect(body).toContain("> a quoted sentence\n>\n> — [p. 1](#/pdf/Attachments/My%20Paper.pdf?page=1)");
  });

  const chooseFile = async (name: string, text: string) => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([text], name, { type: "application/pdf" });
    // jsdom's File has no arrayBuffer()
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode(text).buffer });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
  };

  it("desktop with a vault: a chosen PDF is copied into Attachments and opened from there", async () => {
    io.desktop = true;
    io.writeAttachment.mockResolvedValue("Attachments/paper-1.pdf");
    setState({ loadedVault: "D:/Vault" });
    act(() => root.render(<PdfView />));
    await chooseFile("paper.pdf", "PDFDATA");
    const [wroteRel, wroteData] = io.writeAttachment.mock.calls[0];
    expect(wroteRel).toBe("Attachments/paper.pdf");
    expect(new TextDecoder().decode(wroteData)).toBe("PDFDATA");
    const [name, data, rel] = state().openPdf.mock.calls[0];
    expect(name).toBe("paper-1.pdf");
    expect(rel).toBe("Attachments/paper-1.pdf");
    expect(new TextDecoder().decode(data)).toBe("PDFDATA");
  });

  it("desktop with a vault: if the copy fails the PDF still opens (unsaved) and the user is told", async () => {
    io.desktop = true;
    io.writeAttachment.mockRejectedValue("disk full");
    setState({ loadedVault: "D:/Vault" });
    act(() => root.render(<PdfView />));
    await chooseFile("paper.pdf", "PDFDATA");
    const [name, , rel] = state().openPdf.mock.calls[0];
    expect(name).toBe("paper.pdf");
    expect(rel ?? null).toBeNull();
    expect(state().toast.mock.calls[0][0]).toMatch(/disk full/);
  });

  it("no vault folder: the PDF is opened from the file, not copied", async () => {
    act(() => root.render(<PdfView />));
    await chooseFile("paper.pdf", "PDFDATA");
    expect(io.writeAttachment).not.toHaveBeenCalled();
    const [name, , rel] = state().openPdf.mock.calls[0];
    expect(name).toBe("paper.pdf");
    expect(rel ?? null).toBeNull();
  });

  it("after a reload the vault PDF that was open comes back", async () => {
    io.desktop = true;
    setState({ pdfRel: "Attachments/a.pdf" });
    act(() => root.render(<PdfView />));
    await flush();
    expect(state().openPdfLink).not.toHaveBeenCalled(); // the vault isn't loaded yet
    act(() => setState({ loadedVault: "D:/Vault" }));
    await flush();
    expect(state().openPdfLink).toHaveBeenCalledWith("Attachments/a.pdf", 1);
  });
});
