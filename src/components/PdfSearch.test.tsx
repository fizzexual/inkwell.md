// @vitest-environment jsdom
// PDF hits in both search panels: file name + page + snippet, and a click opens the PDF there.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const semanticSearch = vi.fn();
vi.mock("../search/semantic", () => ({ semanticSearch, isModelReady: () => true }));
const sync = vi.fn(async () => {});
vi.mock("../search/pdfIndex", async (orig) => ({
  ...(await orig<typeof import("../search/pdfIndex")>()),
  syncPdfIndex: sync,
}));
vi.mock("../vault/disk", async (orig) => ({ ...(await orig<typeof import("../vault/disk")>()), isTauri: () => true }));

const { useVault } = await import("../store/useVault");
const { usePdfIndex } = await import("../search/pdfIndex");
const { default: SemanticSearch } = await import("./SemanticSearch");
const { default: SearchPanel } = await import("./SearchPanel");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const openPdfLink = vi.fn(async () => true);

beforeEach(() => {
  useVault.setState({ openPdfLink, loadedVault: "D:/Vault", searchQuery: "", semanticOpen: false });
  usePdfIndex.setState({
    vault: "D:/Vault",
    ready: true,
    pending: 0,
    failed: [],
    docs: [
      {
        rel: "Attachments/paper.pdf",
        pages: 3,
        scanned: false,
        passages: [
          { page: 1, idx: 0, text: "Introduction to machine translation" },
          { page: 3, idx: 0, text: "Results: we report BLEU scores for every system" },
        ],
      },
      { rel: "Attachments/scan.pdf", pages: 2, scanned: true, passages: [] },
    ],
  });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  openPdfLink.mockClear();
  semanticSearch.mockReset();
  sync.mockClear();
});

function mount(el: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}

const click = (el: Element) => act(() => (el as HTMLElement).click());

describe("full-text search panel", () => {
  it("lists the PDF page that has the phrase; a click opens the PDF at that page", () => {
    useVault.setState({ searchQuery: "BLEU" });
    mount(<SearchPanel />);
    const hit = [...host!.querySelectorAll(".search-hit")].find((b) => b.textContent!.includes("paper.pdf"))!;
    expect(hit.textContent).toContain("paper.pdf · p. 3");
    expect(hit.querySelector("mark")?.textContent).toBe("BLEU");
    click(hit);
    expect(openPdfLink).toHaveBeenCalledWith("Attachments/paper.pdf", 3);
  });

  it("says which PDFs have no searchable text, and re-checks the vault's PDFs when opened", () => {
    useVault.setState({ searchQuery: "BLEU" });
    mount(<SearchPanel />);
    expect(host!.querySelector(".pdf-status")?.textContent).toMatch(/scan\.pdf.*no searchable text \(scanned\)/);
    expect(sync).toHaveBeenCalledWith("D:/Vault");
  });
});

describe("semantic search panel", () => {
  it("shows a PDF passage as file · page; a click opens the PDF there and closes the panel", async () => {
    semanticSearch.mockResolvedValue([
      {
        id: "pdf:Attachments/paper.pdf#3.0",
        score: 0.8,
        pdf: { rel: "Attachments/paper.pdf", page: 3, text: "Results: we report BLEU scores for every system" },
      },
    ]);
    useVault.setState({ semanticOpen: true, semanticSeed: "translation quality metric" });
    mount(<SemanticSearch />);
    await act(async () => {});
    const item = host!.querySelector(".sem-item")!;
    expect(item.textContent).toContain("paper.pdf · p. 3");
    expect(item.textContent).toContain("we report BLEU scores");
    click(item);
    expect(openPdfLink).toHaveBeenCalledWith("Attachments/paper.pdf", 3);
    expect(useVault.getState().semanticOpen).toBe(false);
  });
});
