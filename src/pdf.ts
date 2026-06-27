import * as pdfjs from "pdfjs-dist";
// Vite resolves this to a hashed asset URL; pdf.js loads its worker from it.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
