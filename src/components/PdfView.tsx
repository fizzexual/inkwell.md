import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { pdfjs } from "../pdf";
import { ChevronRight, Plus, NoteEdit } from "../icons";
import "pdfjs-dist/web/pdf_viewer.css";
import "./PdfView.css";

export default function PdfView() {
  const pdf = useVault((s) => s.pdf);
  const openPdf = useVault((s) => s.openPdf);
  const createNoteWith = useVault((s) => s.createNoteWith);
  const toast = useVault((s) => s.toast);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]> | null>(null);
  const renderToken = useRef(0);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.3);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // load the document
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setError(null);
    setPage(1);
    const task = pdfjs.getDocument({ data: pdf.data.slice(0) });
    task.promise
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      docRef.current = null;
    };
  }, [pdf]);

  // render the current page + its text layer
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !canvasRef.current) return;
    const token = ++renderToken.current;
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (token !== renderToken.current) return;
        const viewport = p.getViewport({ scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await p.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (token !== renderToken.current) return;

        const textDiv = textRef.current!;
        textDiv.innerHTML = "";
        textDiv.style.width = `${viewport.width}px`;
        textDiv.style.height = `${viewport.height}px`;
        textDiv.style.setProperty("--scale-factor", String(scale));
        const tc = await p.getTextContent();
        if (token !== renderToken.current) return;
        const textLayer = new pdfjs.TextLayer({ textContentSource: tc, container: textDiv, viewport });
        await textLayer.render();
      } catch (e) {
        if (token === renderToken.current) setError(String((e as Error)?.message ?? e));
      }
    })();
  }, [page, scale, numPages]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.arrayBuffer().then((buf) => openPdf(file.name, buf));
  };

  const saveHighlight = () => {
    const quote = window.getSelection()?.toString().trim();
    if (!quote || !pdf) {
      toast("Select some text in the PDF first");
      return;
    }
    const title = `Highlight — ${pdf.name.replace(/\.pdf$/i, "")} p.${page}`;
    const body = `# ${title}\n\n> ${quote.replace(/\n+/g, " ")}\n\n— *${pdf.name}*, page ${page}\n`;
    createNoteWith(title, body, "Highlights");
    toast("Highlight saved to Highlights/");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  if (!pdf) {
    return (
      <main className="pdf-view">
        <div className="pdf-empty">
          <div className="pdf-empty-card">
            <h2>Open a PDF</h2>
            <p>Read a paper here and turn selections into linked notes.</p>
            <label className="pdf-open-btn">
              <Plus size={15} />
              Choose a PDF
              <input type="file" accept="application/pdf" onChange={onFile} hidden />
            </label>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pdf-view">
      <header className="pdf-toolbar">
        <span className="pdf-name">{pdf.name}</span>
        <div className="pdf-controls">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronRight size={15} style={{ transform: "rotate(180deg)" }} />
          </button>
          <span className="pdf-page">
            {page} / {numPages || "…"}
          </span>
          <button disabled={page >= numPages} onClick={() => setPage((p) => Math.min(numPages, p + 1))}>
            <ChevronRight size={15} />
          </button>
          <span className="pdf-sep" />
          <button onClick={() => setScale((s) => Math.max(0.6, s - 0.15))}>−</button>
          <span className="pdf-zoom">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(3, s + 0.15))}>+</button>
          <span className="pdf-sep" />
          <button className="pdf-hl-btn" onClick={saveHighlight}>
            <NoteEdit size={14} />
            {saved ? "Saved!" : "Save highlight"}
          </button>
        </div>
      </header>

      <div className="pdf-scroll">
        {error && <div className="pdf-error">Could not render PDF: {error}</div>}
        <div className="pdf-page-wrap">
          <canvas ref={canvasRef} className="pdf-canvas" />
          <div ref={textRef} className="textLayer" />
        </div>
      </div>
    </main>
  );
}
