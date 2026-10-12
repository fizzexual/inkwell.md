// In-app links to a PDF page: `[p. 12](#/pdf/Attachments/paper.pdf?page=12)`. A hash href, so the
// link guard lets it through to the app's own click handler; the path is the PDF's vault-relative
// path (desktop with a vault folder) or just its file name (browser build / no vault).

const PREFIX = "#/pdf/";

/** Encode one path segment for a markdown link destination (parens too, so `(`/`)` can't end it). */
const enc = (seg: string) => encodeURIComponent(seg).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** The in-app link to `rel` (optionally at `page`). */
export function pdfHref(rel: string, page?: number): string {
  return PREFIX + rel.split("/").map(enc).join("/") + (page ? `?page=${page}` : "");
}

/** A `#/pdf/…` href → the PDF path inside the vault and the page (1 when missing/bad), or null. */
export function parsePdfHref(href: string): { rel: string; page: number } | null {
  if (!href.startsWith(PREFIX)) return null;
  const rest = href.slice(PREFIX.length);
  const q = rest.indexOf("?");
  const path = q < 0 ? rest : rest.slice(0, q);
  const query = q < 0 ? "" : rest.slice(q + 1);
  let segs: string[];
  try {
    segs = path.split("/").map(decodeURIComponent);
  } catch {
    return null;
  }
  // a plain relative path: no empty / `.` / `..` parts, no drive letters or backslashes
  if (segs.some((s) => !s || s === "." || s === ".." || /[\\:\0]/.test(s))) return null;
  const rel = segs.join("/");
  if (!/\.pdf$/i.test(rel)) return null;
  const m = /(?:^|&)page=(\d+)(?:&|$)/.exec(query);
  const n = m ? Number(m[1]) : 1;
  return { rel, page: Number.isSafeInteger(n) && n >= 1 ? n : 1 };
}

// names Windows reserves for devices
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A PDF's file name made safe to store in the vault: readable, no characters a file can't hold. */
export function safeAttachmentName(name: string): string {
  let stem = name.replace(/\.pdf$/i, "");
  stem = stem
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 120)
    .replace(/[\s.]+$/g, "");
  if (!stem) stem = "document";
  if (RESERVED.test(stem)) stem += "_";
  return `${stem}.pdf`;
}

/** Where an opened PDF is copied in the vault. */
export const attachmentRel = (fileName: string) => `Attachments/${safeAttachmentName(fileName)}`;

const baseName = (relOrName: string) => relOrName.slice(relOrName.lastIndexOf("/") + 1);

/** The one running highlights note for a PDF. */
export const highlightsTitle = (relOrName: string) => `${baseName(relOrName).replace(/\.pdf$/i, "")} — Highlights`;

/** One highlight: the quote, then a link back to its page. */
export function highlightEntry(quote: string, page: number, relOrName: string): string {
  return `> ${quote.replace(/\s+/g, " ").trim()}\n>\n> — [p. ${page}](${pdfHref(relOrName, page)})\n`;
}

/** The start of a new highlights note: title, and a link to the PDF itself. */
export function highlightsHeader(relOrName: string): string {
  return `# ${highlightsTitle(relOrName)}\n\n_Source: [${baseName(relOrName)}](${pdfHref(relOrName)})_\n\n`;
}

/**
 * Click handler for rendered notes: a click on a `#/pdf/…` link opens that PDF at that page (and
 * never changes the window's location). Returns true when the click was a PDF link.
 */
export function onPdfLinkClick(
  e: { target: EventTarget | null; preventDefault: () => void },
  open: (rel: string, page: number) => void,
): boolean {
  const a = (e.target as Element | null)?.closest?.(`a[href^="${PREFIX}"]`);
  if (!a) return false;
  e.preventDefault();
  const t = parsePdfHref(a.getAttribute("href") ?? "");
  if (t) open(t.rel, t.page);
  return true;
}
