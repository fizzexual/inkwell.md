import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { pdfjs } from "../pdf";
import { ChevronRight, Plus, NoteEdit } from "../icons";
import { isTauri } from "../vault/disk";
import { openPdfFile } from "../pdfOpen";
import { highlightEntry, highlightsHeader, highlightsTitle } from "../pdfLinks";
import { ensurePdfCss } from "../pdfCss";
import "./PdfView.css";

// pdf.js styles, scoped to .pdf-view so its own `.sidebar` rules can't restyle the app
ensurePdfCss();

export default function PdfView() {
  const pdf = useVault((s) => s.pdf);
  const pdfTarget = useVault((s) => s.pdfTarget);
  const pdfRel = useVault((s) => s.pdfRel);
  const loadedVault = useVault((s) => s.loadedVault);
  const openPdfLink = useVault((s) => s.openPdfLink);
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
        // opened from a page link: start on that page
        const want = useVault.getState().pdfTarget?.page ?? 1;
        setPage(Math.min(Math.max(1, want), d.numPages));
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      setDoc(null);
      // frees the document (and its pages) in the pdf.js worker
      task.destroy().catch(() => {});
    };
  }, [pdf]);

  // a page link for the PDF that is already open: jump there (a NEW request only — the first
  // page of a newly loaded PDF is set by the load above)
  useEffect(() => {
    if (!pdfTarget || !numPages) return;
    setPage(Math.min(Math.max(1, pdfTarget.page), numPages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfTarget]);

  // after a reload / restart: the vault PDF that was open is read back once the vault is loaded
  useEffect(() => {
    if (pdf || !pdfRel || !loadedVault || !isTauri()) return;
    openPdfLink(pdfRel, 1).then((ok) => {
      if (!ok) useVault.setState({ pdfRel: null }); // gone from this vault: don't retry
    });
  }, [pdf, pdfRel, loadedVault, openPdfLink]);

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
        // pdf.js' text-layer CSS sizes glyphs by --total-scale-factor (its full viewer sets it);
        // without it the selectable text is smaller than the drawn text
        textDiv.style.setProperty("--total-scale-factor", String(scale));
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

  // desktop with a vault folder: the PDF is copied into the vault (Attachments/) — see openPdfFile
  const storeInVault = isTauri() && !!loadedVault;
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) openPdfFile(file);
    e.target.value = "";
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
    // links point at the vault file (desktop with a vault) or, without one, at the file name
    const where = pdf.rel ?? pdf.name;
    const title = highlightsTitle(where);
    const entry = highlightEntry(quote, page, where);
    const existingId = resolve(title);
    if (existingId && notesById.get(existingId)) {
      const prev = notesById.get(existingId)!.content ?? "";
      updateContent(existingId, `${prev.replace(/\s*$/, "")}\n\n${entry}`);
    } else {
      createNoteWith(title, `${highlightsHeader(where)}${entry}`, "Highlights");
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
    const id = resolve(highlightsTitle(pdf.rel ?? pdf.name));
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
            <p className="pdf-empty-note">
              {storeInVault
                ? "It is copied into Attachments/ in your vault, so it and the page links in its highlights note work after a restart."
                : "Not saved: without a vault folder the PDF is gone on reload, and page links in highlight notes only jump within the PDF that is open."}
            </p>
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
        <span className="pdf-name" title={pdf.rel ? `In your vault: ${pdf.rel}` : "Not saved in a vault — gone on reload"}>
          {pdf.name}
        </span>
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
