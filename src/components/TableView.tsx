import { useMemo, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { useSmoothScroll } from "../useSmoothScroll";
import { parseFrontmatter, parseTags } from "../markdown";
import { Search, ChevronDown } from "../icons";
import "./TableView.css";

interface Row {
  id: string;
  title: string;
  type: string;
  status: string;
  area: string;
  year: string;
  tags: string[];
  links: number;
}

const COLUMNS: { key: keyof Row; label: string; align?: "right" }[] = [
  { key: "title", label: "Name" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "area", label: "Area" },
  { key: "year", label: "Year" },
  { key: "tags", label: "Tags" },
  { key: "links", label: "Links", align: "right" },
];

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(", ") : (v ?? ""));

export default function TableView() {
  const notes = useVault((s) => s.notes);
  const graph = useVault((s) => s.graph);
  const openArticle = useVault((s) => s.openArticle);
  const openMenu = useVault((s) => s.openMenu);

  const [sortKey, setSortKey] = useState<keyof Row>("title");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  useSmoothScroll(scrollRef);

  const rows = useMemo<Row[]>(() => {
    const degree = new Map(graph.nodes.map((n) => [n.id, n.degree]));
    return notes.map((n) => {
      const fm = parseFrontmatter(n.content ?? "").data;
      return {
        id: n.id,
        title: n.title,
        type: str(fm.type) || (n.kind === "source" ? "source" : "note"),
        status: str(fm.status),
        area: str(fm.area),
        year: str(fm.year),
        tags: parseTags(n.content ?? ""),
        links: degree.get(n.id) ?? 0,
      };
    });
  }, [notes, graph]);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          [r.title, r.type, r.status, r.area, r.year, r.tags.join(" ")]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : rows;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
    return sorted;
  }, [rows, query, sortKey, sortDir]);

  const sortBy = (key: keyof Row) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  return (
    <main className="table-view">
      <header className="table-header">
        <div className="table-title">
          <h1>All Notes</h1>
          <span className="table-subtitle">
            {view.length} of {rows.length}
          </span>
        </div>
        <div className="table-search">
          <Search size={15} />
          <input
            value={query}
            placeholder="Filter…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      <div className="table-scroll" ref={scrollRef}>
        <table className="data-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={(c.align === "right" ? "num " : "") + (sortKey === c.key ? "sorted" : "")}
                  onClick={() => sortBy(c.key)}
                >
                  <span>{c.label}</span>
                  {sortKey === c.key && (
                    <ChevronDown
                      size={12}
                      style={{ transform: sortDir === -1 ? "rotate(180deg)" : "none" }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr
                key={r.id}
                onClick={() => openArticle(r.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(e.clientX, e.clientY, r.id);
                }}
              >
                <td className="cell-name">{r.title}</td>
                <td>{r.type && <span className={"type-chip type-" + r.type}>{r.type}</span>}</td>
                <td>{r.status && <span className={"status-dot status-" + r.status} />}{r.status}</td>
                <td className="cell-muted">{r.area}</td>
                <td className="cell-muted">{r.year}</td>
                <td>
                  <span className="cell-tags">
                    {r.tags.map((t) => (
                      <span key={t} className="cell-tag">
                        #{t}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="num">{r.links}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
