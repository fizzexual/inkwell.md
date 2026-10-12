import DOMPurify from "dompurify";

/**
 * Strip anything executable (scripts, event handlers, javascript: URLs, frames) from HTML that is
 * about to go into the page. Notes, web clips, imports and AI answers are untrusted text, and the
 * webview can call the Rust file commands — so every HTML sink must go through this.
 * KaTeX markup (spans + inline style + svg) and the app's data-* hooks survive untouched.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "form", "iframe", "frame", "object", "embed", "base", "meta", "link"],
    FORBID_ATTR: ["formaction", "srcdoc"],
  });
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for use inside HTML element content or a double-quoted attribute. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}
