import { marked } from "marked";
import { escapeHtml, sanitizeHtml } from "../sanitize";

/** AI chat answer → safe HTML. [[Title]] becomes a clickable link; model output is untrusted. */
export function renderAnswer(md: string): string {
  const withLinks = md.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, t: string) => `<a class="ai-link" data-title="${escapeHtml(t)}">${escapeHtml(t)}</a>`,
  );
  return sanitizeHtml(marked.parse(withLinks, { async: false }) as string);
}
