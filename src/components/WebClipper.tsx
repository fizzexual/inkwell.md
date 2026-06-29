import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import "./WebClipper.css";

export default function WebClipper() {
  const open = useVault((s) => s.clipOpen);
  const setOpen = useVault((s) => s.setClipOpen);
  const createNoteWith = useVault((s) => s.createNoteWith);
  const toast = useVault((s) => s.toast);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl("");
      setError(null);
      setBusy(false);
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const clip = async () => {
    let target = url.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;
    setBusy(true);
    setError(null);
    try {
      // r.jina.ai returns clean, readable Markdown and is CORS-friendly
      const res = await fetch("https://r.jina.ai/" + target, { headers: { Accept: "text/markdown" } });
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const md = await res.text();
      const titleMatch = md.match(/^Title:\s*(.+)$/m) || md.match(/^#\s+(.+)$/m);
      const title = (titleMatch?.[1] || new URL(target).hostname).trim().slice(0, 120);
      const body = `# ${title}\n\n> Clipped from [${target}](${target})\n\n${md.replace(/^Title:.*\n/m, "")}`;
      createNoteWith(title, body, "Clippings");
      toast("Page clipped to Clippings");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch that page.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="clip-backdrop" onMouseDown={() => !busy && setOpen(false)}>
      <div className="clip" onMouseDown={(e) => e.stopPropagation()}>
        <div className="clip-head">Clip a web page</div>
        <input
          ref={ref}
          className="clip-input"
          value={url}
          placeholder="Paste a URL…  e.g. en.wikipedia.org/wiki/Note-taking"
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") clip();
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        {error && <div className="clip-error">{error}</div>}
        <div className="clip-foot">
          <span className="clip-hint">Saves a clean Markdown copy to your Clippings folder.</span>
          <button className="clip-go" disabled={!url.trim() || busy} onClick={clip}>
            {busy ? "Clipping…" : "Clip"}
          </button>
        </div>
      </div>
    </div>
  );
}
