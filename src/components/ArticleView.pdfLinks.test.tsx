// @vitest-environment jsdom
// A click on "p. 12" in a rendered highlights note opens that PDF at that page.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArticleView from "./ArticleView";
import { useVault } from "../store/useVault";
import { highlightEntry, highlightsHeader } from "../pdfLinks";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ArticleView page links", () => {
  it("clicking p. N calls openPdfLink with the file and page, and never navigates", () => {
    const rel = "Attachments/My Paper.pdf";
    const openPdfLink = vi.fn(async () => true);
    act(() => {
      useVault.getState().createNoteWith("My Paper — Highlights", highlightsHeader(rel) + highlightEntry("quote", 12, rel), "Highlights");
      useVault.setState({ openPdfLink, editing: false });
    });
    const id = useVault.getState().selectedId;
    act(() => root.render(<ArticleView noteId={id} isActive />));
    const link = [...host.querySelectorAll("a")].find((a) => a.textContent === "p. 12")!;
    expect(link).toBeTruthy();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => link.dispatchEvent(ev));
    expect(openPdfLink).toHaveBeenCalledWith(rel, 12);
    expect(ev.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe("");

    const source = [...host.querySelectorAll("a")].find((a) => a.textContent === "My Paper.pdf")!;
    act(() => source.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(openPdfLink).toHaveBeenLastCalledWith(rel, 1);
  });
});
