// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  pdfHref,
  parsePdfHref,
  safeAttachmentName,
  highlightEntry,
  highlightsHeader,
  highlightsTitle,
  onPdfLinkClick,
} from "./pdfLinks";

describe("pdf links", () => {
  it("a page link is an in-app hash link to the vault file and page", () => {
    expect(pdfHref("Attachments/paper.pdf", 12)).toBe("#/pdf/Attachments/paper.pdf?page=12");
    expect(pdfHref("Attachments/paper.pdf")).toBe("#/pdf/Attachments/paper.pdf");
    // spaces and other characters are encoded per path segment, so the markdown link stays valid
    expect(pdfHref("Attachments/My Paper (v2).pdf", 3)).toBe("#/pdf/Attachments/My%20Paper%20%28v2%29.pdf?page=3");
    expect(pdfHref("Прикачени/статия.pdf", 1)).toBe(
      "#/pdf/%D0%9F%D1%80%D0%B8%D0%BA%D0%B0%D1%87%D0%B5%D0%BD%D0%B8/%D1%81%D1%82%D0%B0%D1%82%D0%B8%D1%8F.pdf?page=1",
    );
  });

  it("parses back to the same file and page", () => {
    for (const [rel, page] of [
      ["Attachments/paper.pdf", 12],
      ["Attachments/My Paper (v2).pdf", 3],
      ["Прикачени/статия.pdf", 1],
      ["paper.pdf", 7],
    ] as const) {
      expect(parsePdfHref(pdfHref(rel, page))).toEqual({ rel, page });
    }
    expect(parsePdfHref("#/pdf/Attachments/paper.pdf")).toEqual({ rel: "Attachments/paper.pdf", page: 1 });
  });

  it("refuses anything that is not a PDF inside the vault", () => {
    for (const bad of [
      "#/pdf/../secret.pdf",
      "#/pdf/Attachments/../../x.pdf",
      "#/pdf/%2E%2E/x.pdf",
      "#/pdf/C:/x.pdf",
      "#/pdf//etc/x.pdf",
      "#/pdf/a%5Cb.pdf",
      "#/pdf/notes.md",
      "#/pdf/",
      "#/note/x",
      "https://example.com/x.pdf",
      "#/pdf/%E0%A4%A.pdf",
    ]) {
      expect(parsePdfHref(bad), bad).toBeNull();
    }
  });

  it("a bad page number falls back to page 1", () => {
    expect(parsePdfHref("#/pdf/a.pdf?page=0")?.page).toBe(1);
    expect(parsePdfHref("#/pdf/a.pdf?page=-4")?.page).toBe(1);
    expect(parsePdfHref("#/pdf/a.pdf?page=abc")?.page).toBe(1);
    expect(parsePdfHref("#/pdf/a.pdf?page=2.5")?.page).toBe(1);
  });
});

describe("safeAttachmentName", () => {
  it("keeps a readable name but drops anything a file name can't hold", () => {
    expect(safeAttachmentName("paper.pdf")).toBe("paper.pdf");
    expect(safeAttachmentName("My Paper (v2).PDF")).toBe("My Paper (v2).pdf");
    expect(safeAttachmentName('a<b>c:d"e/f\\g|h?i*j.pdf')).toBe("a-b-c-d-e-f-g-h-i-j.pdf");
    expect(safeAttachmentName("  ..hidden. .pdf")).toBe("hidden.pdf");
    expect(safeAttachmentName("con.pdf")).toBe("con_.pdf");
    expect(safeAttachmentName(".pdf")).toBe("document.pdf");
    expect(safeAttachmentName("noext")).toBe("noext.pdf");
    expect(safeAttachmentName("статия.pdf")).toBe("статия.pdf");
    expect(safeAttachmentName("x".repeat(300) + ".pdf").length).toBeLessThanOrEqual(124);
  });
});

describe("highlights note", () => {
  it("each quote links to its page; the title comes from the file", () => {
    expect(highlightEntry("a  quote\nacross lines", 12, "Attachments/paper.pdf")).toBe(
      "> a quote across lines\n>\n> — [p. 12](#/pdf/Attachments/paper.pdf?page=12)\n",
    );
    expect(highlightsTitle("Attachments/paper-1.pdf")).toBe("paper-1 — Highlights");
    expect(highlightsTitle("My Paper.PDF")).toBe("My Paper — Highlights");
  });
});

describe("onPdfLinkClick", () => {
  const click = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const open = vi.fn();
    const handled: boolean[] = [];
    host.addEventListener("click", (e) => handled.push(onPdfLinkClick(e, open)));
    const target = host.querySelector("span, a")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    host.remove();
    return { open, handled: handled[0], prevented: ev.defaultPrevented };
  };

  it("a click on a page link opens that file at that page and never navigates", () => {
    const r = click('<a href="#/pdf/Attachments/My%20Paper.pdf?page=12"><span>p. 12</span></a>');
    expect(r.open).toHaveBeenCalledWith("Attachments/My Paper.pdf", 12);
    expect(r.handled).toBe(true);
    expect(r.prevented).toBe(true);
  });

  it("other links are left alone; a bad pdf link is swallowed", () => {
    const other = click('<a href="#/note/x">x</a>');
    expect(other.open).not.toHaveBeenCalled();
    expect(other.handled).toBe(false);
    expect(other.prevented).toBe(false);
    const bad = click('<a href="#/pdf/../x.pdf?page=2">x</a>');
    expect(bad.open).not.toHaveBeenCalled();
    expect(bad.prevented).toBe(true);
  });
});

describe("a highlights note rendered", () => {
  it("keeps the page links (through the sanitizer) and they open the right page", async () => {
    const { renderMarkdown } = await import("./markdown");
    const rel = "Attachments/My Paper (v2).pdf";
    const md = highlightsHeader(rel) + highlightEntry("the quote", 12, rel);
    const host = document.createElement("div");
    host.innerHTML = renderMarkdown(md, { resolve: () => undefined, getNote: () => undefined });
    const links = [...host.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["My Paper (v2).pdf", "#/pdf/Attachments/My%20Paper%20%28v2%29.pdf"],
      ["p. 12", "#/pdf/Attachments/My%20Paper%20%28v2%29.pdf?page=12"],
    ]);
    const open = vi.fn();
    host.addEventListener("click", (e) => onPdfLinkClick(e, open));
    document.body.appendChild(host);
    host.querySelectorAll("a")[1].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    host.remove();
    expect(open).toHaveBeenCalledWith(rel, 12);
  });
});
