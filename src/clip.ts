// Web clipping. Desktop: Rust fetches the page (fetch_page refuses local/private addresses) and the
// webview turns the HTML into markdown here — no third party sees the URL. Browser build (no Rust):
// the web-only fallback asks r.jina.ai for a markdown copy.
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { isTauri } from "./vault/disk";

export interface Clip {
  title: string;
  byline: string | null;
  markdown: string;
}

/** Elements that are never content (and must never be turned into text). */
const JUNK = "script, style, noscript, template, iframe, frame, object, embed, form, nav, header, footer, aside, svg, canvas";

function turndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
  });
  td.remove(["script", "style", "noscript", "template", "iframe", "object", "embed", "form", "button", "input", "select", "textarea"] as TurndownService.Filter);
  return td;
}

/**
 * A fetched HTML page → its main article as markdown. The HTML is parsed with DOMParser, which
 * never runs scripts or loads anything; relative links are made absolute against `url`.
 */
export function htmlToClip(html: string, url: string): Clip {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // links in the clip must point at the page's site, honouring the page's own <base> if it has one
  let base = url;
  try {
    const own = doc.querySelector("base[href]")?.getAttribute("href");
    if (own) base = new URL(own, url).href;
  } catch {
    /* keep the page URL */
  }
  doc.querySelectorAll("base").forEach((b) => b.remove());
  const baseEl = doc.createElement("base");
  baseEl.setAttribute("href", base);
  doc.head.prepend(baseEl);

  const pageTitle = doc.title?.trim() ?? "";
  const article = new Readability(doc.cloneNode(true) as Document).parse();

  let root: HTMLElement;
  if (article?.content) {
    root = new DOMParser().parseFromString(article.content, "text/html").body;
  } else {
    // too short for reader view: the whole body minus page chrome, links made absolute by hand
    root = doc.body;
    root.querySelectorAll(JUNK).forEach((el) => el.remove());
    root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      try {
        a.setAttribute("href", new URL(a.getAttribute("href") ?? "", base).href);
      } catch {
        a.removeAttribute("href");
      }
    });
  }
  const title = (article?.title || pageTitle || new URL(url).hostname).trim();
  const markdown = turndown()
    .turndown(root)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, byline: article?.byline?.trim() || null, markdown };
}

/** One line, safe as a frontmatter value. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The note for a clip: frontmatter (title, author, source, date), heading, source line, text. */
export function clipToNote(clip: Clip, source: string): { title: string; body: string } {
  const title = oneLine(clip.title).slice(0, 120) || "Clipped page";
  const fm = [
    "---",
    `title: ${title}`,
    ...(clip.byline ? [`author: ${oneLine(clip.byline)}`] : []),
    `source: ${oneLine(source)}`,
    `clipped: ${today()}`,
    "---",
  ].join("\n");
  // drop a leading `# Title` the article repeats
  const text = clip.markdown.replace(/^#\s+(.+)\n+/, (m, h: string) => (oneLine(h) === title ? "" : m));
  return { title, body: `${fm}\n\n# ${title}\n\n> Clipped from [${source}](${source})\n\n${text}\n` };
}

/** Desktop: Rust fetches the page (and refuses local/private addresses). */
async function viaRust(url: string): Promise<{ title: string; body: string }> {
  const { invoke } = await import("@tauri-apps/api/core");
  let page: { final_url: string; html: string };
  try {
    page = await invoke<{ final_url: string; html: string }>("fetch_page", { url });
  } catch (e) {
    throw new Error(typeof e === "string" ? e : e instanceof Error ? e.message : "Could not fetch that page.");
  }
  return clipToNote(htmlToClip(page.html, page.final_url), page.final_url);
}

/** Web-only fallback (no Rust in the browser build): r.jina.ai returns the page as markdown. */
async function viaJina(url: string, signal?: AbortSignal): Promise<{ title: string; body: string }> {
  const res = await fetch("https://r.jina.ai/" + url, { headers: { Accept: "text/markdown" }, signal });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const md = await res.text();
  const titleMatch = md.match(/^Title:\s*(.+)$/m) || md.match(/^#\s+(.+)$/m);
  const title = (titleMatch?.[1] || new URL(url).hostname).trim();
  const text = md
    .replace(/^Title:.*\n/m, "")
    .replace(/^URL Source:.*\n/m, "")
    .replace(/^Markdown Content:\s*\n/m, "")
    .trim();
  return clipToNote({ title, byline: null, markdown: text }, url);
}

/** Fetch `url` and turn it into a note (title + markdown body with frontmatter). */
export function clipPage(url: string, signal?: AbortSignal): Promise<{ title: string; body: string }> {
  return isTauri() ? viaRust(url) : viaJina(url, signal);
}
