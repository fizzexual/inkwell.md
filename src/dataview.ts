// Dataview-style queries: a ```query fenced block pulls notes by folder / tag / frontmatter
// into a live table, list, or cards embedded right in a note. All local, evaluated at render time.
//
//   ```query
//   from: Projects
//   tag: active
//   where: status = todo
//   sort: title asc
//   as: table
//   fields: title, status, due
//   limit: 20
//   ```
import type { Note } from "./data/vault";
import { parseTags, parseFrontmatter } from "./markdown";

interface Where {
  field: string;
  op: "=" | "!=" | "contains" | ">" | "<" | ">=" | "<=";
  value: string;
}
interface Query {
  from: string[];
  tags: string[];
  where: Where[];
  sort?: { field: string; dir: "asc" | "desc" };
  limit: number;
  as: "table" | "list" | "cards";
  fields: string[];
}

const OPS = ["!=", ">=", "<=", "contains", "=", ">", "<"];

function parseQuery(src: string): Query {
  const q: Query = { from: [], tags: [], where: [], limit: 100, as: "list", fields: [] };
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (!val) continue;
    if (key === "from") q.from.push(...val.split(",").map((s) => s.trim()).filter(Boolean));
    else if (key === "tag" || key === "tags")
      q.tags.push(...val.split(/[,\s]+/).map((s) => s.replace(/^#/, "").toLowerCase()).filter(Boolean));
    else if (key === "where") {
      const op = OPS.find((o) => val.includes(` ${o} `) || (o.length === 1 && new RegExp(`\\s${o}\\s`).test(val)));
      if (op) {
        const [field, ...rest] = val.split(new RegExp(`\\s${op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s`));
        q.where.push({
          field: field.trim(),
          op: op as Where["op"],
          value: rest.join(op).trim().replace(/^["']|["']$/g, ""),
        });
      }
    } else if (key === "sort") {
      const [field, dir] = val.split(/\s+/);
      q.sort = { field, dir: (dir || "asc").toLowerCase() === "desc" ? "desc" : "asc" };
    } else if (key === "limit") q.limit = Math.max(1, Math.min(500, parseInt(val, 10) || 100));
    else if (key === "as") q.as = (["table", "list", "cards"].includes(val.toLowerCase()) ? val.toLowerCase() : "list") as Query["as"];
    else if (key === "fields") q.fields = val.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return q;
}

function fieldValue(n: Note, field: string): string {
  const f = field.toLowerCase();
  if (f === "title") return n.title;
  if (f === "folder") return n.folder ?? "";
  if (f === "tags") return parseTags(n.content ?? "").join(", ");
  const { data } = parseFrontmatter(n.content ?? "");
  const v = data[field] ?? data[f];
  return v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
}

function matchWhere(n: Note, w: Where): boolean {
  const actual = fieldValue(n, w.field);
  const a = actual.toLowerCase();
  const e = w.value.toLowerCase();
  const na = parseFloat(actual);
  const ne = parseFloat(w.value);
  const bothNum = !Number.isNaN(na) && !Number.isNaN(ne);
  switch (w.op) {
    case "=":
      return a === e;
    case "!=":
      return a !== e;
    case "contains":
      return a.includes(e);
    case ">":
      return bothNum ? na > ne : a > e;
    case "<":
      return bothNum ? na < ne : a < e;
    case ">=":
      return bothNum ? na >= ne : a >= e;
    case "<=":
      return bothNum ? na <= ne : a <= e;
  }
}

function evalQuery(q: Query, notes: Note[], selfId?: string): Note[] {
  let rows = notes.filter((n) => n.id !== selfId); // never include the note the query lives in
  if (q.from.length)
    rows = rows.filter((n) => q.from.some((f) => (n.folder ?? "").toLowerCase().startsWith(f.toLowerCase())));
  if (q.tags.length)
    rows = rows.filter((n) => {
      const t = new Set(parseTags(n.content ?? ""));
      return q.tags.every((x) => t.has(x));
    });
  for (const w of q.where) rows = rows.filter((n) => matchWhere(n, w));
  if (q.sort) {
    const { field, dir } = q.sort;
    rows = [...rows].sort((a, b) => {
      const cmp = fieldValue(a, field).localeCompare(fieldValue(b, field), undefined, { numeric: true });
      return dir === "desc" ? -cmp : cmp;
    });
  }
  return rows.slice(0, q.limit);
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const link = (n: Note) => `<a class="wikilink" href="#/note/${n.id}" data-note="${n.id}">${esc(n.title)}</a>`;

/** Evaluate a query block against the vault and return HTML (table / list / cards). */
export function runQuery(src: string, notes: Note[], selfId?: string): string {
  let q: Query;
  try {
    q = parseQuery(src);
  } catch {
    return `<div class="inkql inkql-error">Couldn't read this query.</div>`;
  }
  const results = evalQuery(q, notes, selfId);
  const count = `<div class="inkql-count">${results.length} note${results.length === 1 ? "" : "s"}</div>`;
  if (!results.length) return `<div class="inkql">${count}<div class="inkql-empty">No notes match.</div></div>`;

  if (q.as === "table") {
    const fields = q.fields.length ? q.fields : ["title"];
    const head = fields.map((f) => `<th>${esc(f)}</th>`).join("");
    const body = results
      .map(
        (n) =>
          "<tr>" +
          fields.map((f) => (f.toLowerCase() === "title" ? `<td>${link(n)}</td>` : `<td>${esc(fieldValue(n, f))}</td>`)).join("") +
          "</tr>",
      )
      .join("");
    return `<div class="inkql">${count}<table class="inkql-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  if (q.as === "cards") {
    const cards = results
      .map((n) => `<div class="inkql-card">${link(n)}${n.folder ? `<span class="inkql-folder">${esc(n.folder)}</span>` : ""}</div>`)
      .join("");
    return `<div class="inkql">${count}<div class="inkql-cards">${cards}</div></div>`;
  }
  const items = results
    .map((n) => `<li>${link(n)}${n.folder ? `<span class="inkql-folder">${esc(n.folder)}</span>` : ""}</li>`)
    .join("");
  return `<div class="inkql">${count}<ul class="inkql-list">${items}</ul></div>`;
}
