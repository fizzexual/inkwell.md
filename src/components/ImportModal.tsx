import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { filesToNotes, parseBib, fetchSource } from "../importers";
import { Download, FileText, BookMarked } from "lucide-react";
import "./ImportModal.css";

export default function ImportModal() {
  const open = useVault((s) => s.importOpen);
  const setOpen = useVault((s) => s.setImportOpen);
  const importNotes = useVault((s) => s.importNotes);
  const toast = useVault((s) => s.toast);

  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const bibRef = useRef<HTMLInputElement>(null);
  const [doi, setDoi] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // enable directory selection on the folder input (non-standard attribute)
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("directory", "");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const onMarkdown = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    const items = await filesToNotes(files);
    if (!items.length) return toast("No Markdown files found");
    importNotes(items);
    setOpen(false);
  };

  const onBib = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const items = parseBib(await file.text());
    if (!items.length) return toast("No entries found in that .bib file");
    importNotes(items);
    setOpen(false);
  };

  const onAddSource = async () => {
    const q = doi.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const item = await fetchSource(q);
      importNotes([item]);
      setDoi("");
      setOpen(false);
      toast(`Added source · ${item.title.slice(0, 40)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't fetch that reference.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="imp-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="imp" onMouseDown={(e) => e.stopPropagation()}>
        <header className="imp-head">
          <h2>Import into your vault</h2>
          <button className="imp-x" onClick={() => setOpen(false)}>
            ✕
          </button>
        </header>

        <div className="imp-card">
          <div className="imp-ico"><Download size={18} /></div>
          <div className="imp-text">
            <h3>Markdown, Obsidian or Notion</h3>
            <p>Import a folder of notes or individual files. Folder structure and links are preserved.</p>
            <div className="imp-actions">
              <button onClick={() => folderRef.current?.click()}>Choose folder…</button>
              <button className="ghost" onClick={() => filesRef.current?.click()}>Choose files…</button>
            </div>
          </div>
        </div>

        <div className="imp-card">
          <div className="imp-ico"><BookMarked size={18} /></div>
          <div className="imp-text">
            <h3>BibTeX (.bib)</h3>
            <p>Import a reference library — each entry becomes a citeable source note.</p>
            <div className="imp-actions">
              <button onClick={() => bibRef.current?.click()}>Choose .bib file…</button>
            </div>
          </div>
        </div>

        <div className="imp-card">
          <div className="imp-ico"><FileText size={18} /></div>
          <div className="imp-text">
            <h3>Add a source by DOI or arXiv</h3>
            <p>Paste a DOI (10.1000/…) or arXiv id/URL and Inkwell fetches the metadata.</p>
            <div className="imp-actions">
              <input
                className="imp-input"
                value={doi}
                placeholder="10.1145/3292500  ·  2408.01234  ·  arxiv.org/abs/…"
                disabled={busy}
                onChange={(e) => setDoi(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddSource()}
              />
              <button onClick={onAddSource} disabled={busy || !doi.trim()}>
                {busy ? "Fetching…" : "Add source"}
              </button>
            </div>
            {error && <div className="imp-error">{error}</div>}
          </div>
        </div>

        <p className="imp-note">Imported notes are added to your current vault — nothing is overwritten.</p>

        <input ref={folderRef} type="file" multiple hidden onChange={onMarkdown} />
        <input ref={filesRef} type="file" multiple accept=".md,.markdown,.txt" hidden onChange={onMarkdown} />
        <input ref={bibRef} type="file" accept=".bib,.bibtex" hidden onChange={onBib} />
      </div>
    </div>
  );
}
