import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scopedPdfCss } from "./pdfCss";

// pdf.js' viewer stylesheet has its own `.sidebar` (width, padding, radius, dark `light-dark()` bg…):
// imported globally it restyled Inkwell's sidebar as soon as a PDF was opened.
const viewerCss = readFileSync("node_modules/pdfjs-dist/web/pdf_viewer.css", "utf8");

describe("pdf.js styles are scoped to the PDF view", () => {
  it("wraps the whole sheet in @scope (.pdf-view)", () => {
    const out = scopedPdfCss(viewerCss);
    expect(out.startsWith("@scope (.pdf-view) {")).toBe(true);
    expect(out.trimEnd().endsWith("}")).toBe(true);
    expect(out).toContain(".textLayer");
  });

  it("keeps pdf.js' :root variables working inside the scope", () => {
    expect(viewerCss).toMatch(/:root/);
    expect(scopedPdfCss(viewerCss)).not.toMatch(/:root/);
  });

  it("PdfView no longer imports the stylesheet globally", () => {
    expect(readFileSync("src/components/PdfView.tsx", "utf8")).not.toMatch(/import\s+["']pdfjs-dist\/web\/pdf_viewer\.css["']/);
  });
});
