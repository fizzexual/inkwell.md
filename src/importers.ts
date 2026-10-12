// Bring external content into the vault: Markdown/Obsidian/Notion files, Inkwell JSON backups,
// BibTeX, and DOI/arXiv lookups.

export interface ImportItem {
  title: string;
  content: string;
  folder?: string;
  kind?: "note" | "source";
}

const MD_RE = /\.(md|markdown|txt)$/i;

/** Strip Notion's 32-hex id suffix from a file/folder name. */
function cleanName(s: string): string {
  return s.replace(/\s+[0-9a-f]{32}$/i, "").trim();
}

/** Read selected files (or a chosen folder) into notes, preserving folder structure. */
export async function filesToNotes(files: File[]): Promise<ImportItem[]> {
  const out: ImportItem[] = [];
  for (const f of files) {
    if (!MD_RE.test(f.name)) continue;
    const content = await f.text();
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const parts = rel.split("/");
    const fname = parts.pop() ?? f.name;
    // drop the top-level wrapper folder when a directory was picked
    const folder = parts.slice(1).map(cleanName).filter(Boolean).join("/");
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const base = cleanName(fname.replace(MD_RE, ""));
    out.push({ title: heading || base || "Untitled", content, folder });
  }
  return out;
}

// ---- Inkwell JSON backup ----

const NOT_A_BACKUP = "That file is not an Inkwell JSON backup.";

/**
 * Read a JSON backup written by exportVaultJson() (`{ version: 1, notes: Note[] }`) back into
 * importable notes. Ids are not kept: the vault gives each imported note a fresh id, so nothing
 * existing is overwritten (links are by title, so they still resolve). Malformed notes are skipped.
 */
export function parseVaultJson(text: string): { items: ImportItem[]; skipped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  const d = data as { version?: unknown; notes?: unknown } | null;
  if (!d || typeof d !== "object" || Array.isArray(d) || !Array.isArray(d.notes) || d.version === undefined)
    throw new Error(NOT_A_BACKUP);
  if (d.version !== 1) throw new Error(`This backup is format version ${String(d.version)}, which this Inkwell can't read.`);

  const items: ImportItem[] = [];
  let skipped = 0;
  for (const raw of d.notes as unknown[]) {
    const n = raw as { title?: unknown; content?: unknown; folder?: unknown; kind?: unknown } | null;
    const title = n && typeof n === "object" && typeof n.title === "string" ? n.title.trim() : "";
    if (!title) {
      skipped++;
      continue;
    }
    items.push({
      title,
      content: typeof n!.content === "string" ? n!.content : `# ${title}\n`,
      folder: typeof n!.folder === "string" ? n!.folder : "",
      kind: n!.kind === "source" ? "source" : "note",
    });
  }
  return { items, skipped };
}

// ---- sources ----

function citekeyOf(authors: string, year: string): string {
  const first = authors.split(",")[0]?.trim().split(/\s+/).pop() || "source";
  return (first.toLowerCase().replace(/[^a-z0-9]/g, "") + (year || "")) || "source";
}

function sourceNote(m: {
  title: string;
  authors?: string;
  year?: string;
  venue?: string;
  citekey: string;
  doi?: string;
  url?: string;
  abstract?: string;
}): ImportItem {
  const fm = [
    "---",
    "type: source",
    m.authors && `authors: ${m.authors}`,
    m.year && `year: ${m.year}`,
    m.venue && `venue: ${m.venue}`,
    `citekey: ${m.citekey}`,
    m.doi && `doi: ${m.doi}`,
    "---",
    "",
  ]
    .filter((x) => x !== "")
    .join("\n");
  const body = [
    `# ${m.title}`,
    "",
    m.abstract ? `> ${m.abstract}\n` : "",
    m.url ? `[Open source](${m.url})\n` : "",
    `Cite inline with \`[@${m.citekey}]\`.`,
    "",
    "#source",
  ].join("\n");
  return { title: m.title, content: `${fm}\n${body}`, folder: "Sources", kind: "source" };
}

/** Minimal BibTeX parser → source notes (handles simple `key = {value}` / `"value"` fields). */
export function parseBib(text: string): ImportItem[] {
  const out: ImportItem[] = [];
  const entryRe = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)(?=@\w+\s*\{|$)/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(text))) {
    const type = m[1].toLowerCase();
    if (type === "comment" || type === "preamble" || type === "string") continue;
    const key = m[2].trim();
    const body = m[3];
    const field = (name: string) => {
      const fm = new RegExp(`${name}\\s*=\\s*[{"]([\\s\\S]*?)[}"]\\s*,?`, "i").exec(body);
      return fm ? fm[1].replace(/[{}]/g, "").replace(/\s+/g, " ").trim() : "";
    };
    const title = field("title") || key;
    const authors = field("author").replace(/\s+and\s+/gi, ", ");
    const year = field("year");
    const venue = field("journal") || field("booktitle") || field("publisher");
    out.push(
      sourceNote({ title, authors, year, venue, citekey: key, doi: field("doi"), url: field("url"), abstract: field("abstract") }),
    );
  }
  return out;
}

/** Look up a paper by DOI (Crossref) or arXiv id → a source note. */
export async function fetchSource(input: string): Promise<ImportItem> {
  const s = input.trim();
  const isArxiv = /arxiv/i.test(s) || /^\d{4}\.\d{4,5}(v\d+)?$/.test(s);
  return isArxiv ? fetchArxiv(s) : fetchDoi(s);
}

async function fetchDoi(doi: string): Promise<ImportItem> {
  const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
  if (!res.ok) throw new Error(`DOI not found (${res.status})`);
  const d = (await res.json()).message;
  const title = (d.title?.[0] || "Untitled").trim();
  const authors = (d.author || [])
    .map((a: { given?: string; family?: string }) => [a.given, a.family].filter(Boolean).join(" "))
    .join(", ");
  const year = String(
    d["published-print"]?.["date-parts"]?.[0]?.[0] ??
      d["published-online"]?.["date-parts"]?.[0]?.[0] ??
      d.created?.["date-parts"]?.[0]?.[0] ??
      "",
  );
  const venue = (d["container-title"]?.[0] || d.publisher || "").trim();
  const abstract = (d.abstract || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return sourceNote({ title, authors, year, venue, citekey: citekeyOf(authors, year), doi: clean, url: d.URL, abstract });
}

async function fetchArxiv(id: string): Promise<ImportItem> {
  const clean = id
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, "")
    .replace(/\.pdf$/i, "")
    .replace(/v\d+$/i, "");
  const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(clean)}`);
  if (!res.ok) throw new Error(`arXiv error (${res.status})`);
  const doc = new DOMParser().parseFromString(await res.text(), "application/xml");
  const entry = doc.querySelector("entry");
  if (!entry) throw new Error("arXiv paper not found");
  const title = entry.querySelector("title")?.textContent?.replace(/\s+/g, " ").trim() || "Untitled";
  const authors = [...entry.querySelectorAll("author name")]
    .map((n) => n.textContent?.trim())
    .filter(Boolean)
    .join(", ");
  const year = (entry.querySelector("published")?.textContent || "").slice(0, 4);
  const abstract = entry.querySelector("summary")?.textContent?.replace(/\s+/g, " ").trim() || "";
  return sourceNote({
    title,
    authors,
    year,
    venue: "arXiv",
    citekey: citekeyOf(authors, year),
    url: `https://arxiv.org/abs/${clean}`,
    abstract,
  });
}
