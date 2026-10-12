// pdf.js' viewer stylesheet, but only inside the PDF view. Imported globally it also styled the
// app's own `.sidebar` (pdf.js has a `.sidebar` class: width, padding, radius and a light-dark()
// background that turned dark on a dark-mode OS) the moment a PDF was opened.
import viewerCss from "pdfjs-dist/web/pdf_viewer.css?inline";

/** Wrap a stylesheet so it only applies inside `.pdf-view`; its :root variables move to the scope root. */
export function scopedPdfCss(css: string): string {
  return `@scope (.pdf-view) {\n${css.replace(/:root/g, ":scope")}\n}\n`;
}

let injected = false;

/** Add the scoped pdf.js styles to the page once. */
export function ensurePdfCss(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.pdfjs = "";
  style.textContent = scopedPdfCss(viewerCss);
  document.head.appendChild(style);
}
