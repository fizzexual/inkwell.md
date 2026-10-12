import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { isTauri } from "../vault/disk";
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
  const abortRef = useRef<AbortController | null>(null);

  const close = () => {
    abortRef.current?.abort();
    setOpen(false);
  };

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
    const controller = new AbortController();
    abortRef.current = controller;
    // desktop: Rust gives up after 20 s with its own message, so wait a little longer for it
    const timeout = setTimeout(() => controller.abort(), isTauri() ? 25000 : 20000);
    try {
      // Readability + Turndown load only when a page is actually clipped
      const { clipPage } = await import("../clip");
      const { title, body } = await clipPage(target, controller.signal);
      // closed (or timed out) while the page was on its way: don't create a note behind the user's back
      if (controller.signal.aborted) throw new DOMException("aborted", "AbortError");
      createNoteWith(title, body, "Clippings");
      toast("Page clipped to Clippings");
      setOpen(false);
    } catch (e) {
      if (controller.signal.aborted) setError("Timed out — the page took too long. Try again.");
      else setError(e instanceof Error ? e.message : "Could not fetch that page.");
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <div className="clip-backdrop" onMouseDown={close}>
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
            else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
        />
        {error && <div className="clip-error">{error}</div>}
        <div className="clip-foot">
          <span className="clip-hint">
            Saves a clean Markdown copy to your Clippings folder.
            {!isTauri() && (
              <>
                {" "}
                <b>Web-only fallback:</b> in the browser the page is fetched through r.jina.ai, which sees the URL.
                The desktop app fetches pages itself.
              </>
            )}
          </span>
          <button className="clip-go" disabled={!url.trim() || busy} onClick={clip}>
            {busy ? "Clipping…" : "Clip"}
          </button>
        </div>
      </div>
    </div>
  );
}
