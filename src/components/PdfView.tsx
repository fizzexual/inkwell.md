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
  const resolve = useVault((s) => s.resolve);
  const notesById = useVault((s) => s.notesById);
  const updateContent = useVault((s) => s.updateContent);
  const openArticle = useVault((s) => s.openArticle);
  const toast = useVault((s) => s.toast);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const renderToken = useRef(0);

  // the loaded document lives in state so the page render re-runs whenever a new PDF arrives
  const [doc, setDoc] = useState<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]> | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.3);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // floating "add highlight" button anchored to the current text selection
  const [sel, setSel] = useState<{ x: number; y: number } | null>(null);

  // load the document
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setError(null);
    setPage(1);
    const task = pdfjs.getDocument({ data: pdf.data.slice(0) });
    task.promise
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      setDoc(null);
      // frees the document (and its pages) in the pdf.js worker
      task.destroy().catch(() => {});
    };
  }, [pdf]);

  // render the current page + its text layer
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    const token = ++renderToken.current;
    // the in-flight canvas render / text layer, cancelled when a newer render starts
    let renderTask: { cancel: () => void } | null = null;
    let textLayer: { cancel: () => void } | null = null;
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
        const task = p.render({ canvas, canvasContext: ctx, viewport });
        renderTask = task;
        await task.promise;
        if (token !== renderToken.current) return;

        const textDiv = textRef.current!;
        textDiv.innerHTML = "";
        textDiv.style.width = `${viewport.width}px`;
        textDiv.style.height = `${viewport.height}px`;
        textDiv.style.setProperty("--scale-factor", String(scale));
        const tc = await p.getTextContent();
        if (token !== renderToken.current) return;
        const layer = new pdfjs.TextLayer({ textContentSource: tc, container: textDiv, viewport });
        textLayer = layer;
        await layer.render();
      } catch (e) {
        if (token === renderToken.current) setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      // a newer page/zoom/document (or unmount): stop drawing the old one on the shared canvas
      if (token === renderToken.current) renderToken.current++;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, page, scale]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.arrayBuffer().then((buf) => openPdf(file.name, buf));
  };

  // append the current selection to ONE running "<pdf> — Highlights" note (create it the first time)
  const saveHighlight = () => {
    const quote = window.getSelection()?.toString().trim();
    if (!quote || !pdf) {
      toast("Select some text in the PDF first");
      return;
    }
    setSel(null);
    window.getSelection()?.removeAllRanges();
    const base = pdf.name.replace(/\.pdf$/i, "");
    const title = `${base} — Highlights`;
    const entry = `> ${quote.replace(/\s*\n\s*/g, " ")}\n>\n> — page ${page}\n`;
    const existingId = resolve(title);
    if (existingId && notesById.get(existingId)) {
      const prev = notesById.get(existingId)!.content ?? "";
      updateContent(existingId, `${prev.replace(/\s*$/, "")}\n\n${entry}`);
    } else {
      createNoteWith(title, `# ${title}\n\n_Source: ${pdf.name}_\n\n${entry}`, "Highlights");
    }
    toast(`Highlight added to “${title}”`);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  // show the floating button when text is selected inside the PDF
  const onSelect = () => {
    const s = window.getSelection();
    const text = s?.toString().trim();
    if (!text || !s || s.rangeCount === 0 || !textRef.current) return setSel(null);
    const range = s.getRangeAt(0);
    if (!textRef.current.contains(range.commonAncestorContainer)) return setSel(null);
    const r = range.getBoundingClientRect();
    if (!r.width) return setSel(null);
    setSel({ x: r.left + r.width / 2, y: r.top - 8 });
  };

  const openHighlights = () => {
    if (!pdf) return;
    const id = resolve(`${pdf.name.replace(/\.pdf$/i, "")} — Highlights`);
    if (id) openArticle(id);
    else toast("No highlights yet — select text and add one");
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
          <button className="pdf-hl-open" onClick={openHighlights} title="Open this PDF's highlights note">
            Highlights
          </button>
        </div>
      </header>

      <div className="pdf-scroll" onMouseUp={onSelect}>
        {error && <div className="pdf-error">Could not render PDF: {error}</div>}
        <div className="pdf-page-wrap">
          <canvas ref={canvasRef} className="pdf-canvas" />
          <div ref={textRef} className="textLayer" />
        </div>
      </div>

      {sel && (
        <button
          className="pdf-sel-btn"
          style={{ left: sel.x, top: sel.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={saveHighlight}
        >
          <NoteEdit size={13} /> Add highlight
        </button>
      )}
    </main>
  );
}
