import { useMemo } from "react";
import { useVault } from "../store/useVault";
import { parseTags } from "../markdown";
import { Search } from "../icons";
import "./SearchPanel.css";

interface Hit {
  id: string;
  title: string;
  folder: string;
  snippet: { before: string; match: string; after: string } | null;
  inTitle: boolean;
}

function makeSnippet(content: string, q: string) {
  const i = content.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, i - 32);
  const end = Math.min(content.length, i + q.length + 48);
  return {
    before: (start > 0 ? "…" : "") + content.slice(start, i),
    match: content.slice(i, i + q.length),
    after: content.slice(i + q.length, end) + (end < content.length ? "…" : ""),
  };
}

export default function SearchPanel() {
  const notes = useVault((s) => s.notes);
  const openArticle = useVault((s) => s.openArticle);
  const select = useVault((s) => s.select);
  const query = useVault((s) => s.searchQuery);
  const setQuery = useVault((s) => s.setSearchQuery);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim();
    if (q.length < 1) return [];
    const lc = q.toLowerCase();
    return notes
      .map((n) => {
        const inTitle = n.title.toLowerCase().includes(lc);
        const body = (n.content ?? "").replace(/\n+/g, " ");
        const inBody = body.toLowerCase().includes(lc);
        if (!inTitle && !inBody) return null;
        return {
          id: n.id,
          title: n.title,
          folder: n.folder,
          inTitle,
          snippet: inBody ? makeSnippet(body, q) : null,
        } as Hit;
      })
      .filter((h): h is Hit => h !== null)
      .sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
  }, [notes, query]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) for (const t of parseTags(note.content ?? "")) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  return (
    <div className="search-panel">
      <div className="search-box">
        <Search size={15} />
        <input
          autoFocus
          value={query}
          placeholder="Search all notes…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {query && (
        <div className="search-count">
          {hits.length} {hits.length === 1 ? "result" : "results"}
        </div>
      )}

      {!query && tags.length > 0 && (
        <div className="tag-explorer">
          <div className="search-count">Browse by tag · {tags.length}</div>
          {tags.map(([tag, count]) => {
            const depth = tag.split("/").length - 1;
            const leaf = tag.split("/").pop();
            return (
              <button
                key={tag}
                className="tag-row"
                style={{ paddingLeft: 9 + depth * 14 }}
                onClick={() => setQuery(`#${tag}`)}
              >
                <span className="tag-hash">#</span>
                <span className="tag-name">{depth ? leaf : tag}</span>
                <span className="tag-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="search-results">
        {hits.map((h, i) => (
          <button
            key={h.id}
            className="search-hit"
            style={{ animationDelay: `${Math.min(i * 22, 320)}ms` }}
            onClick={() => openArticle(h.id)}
            onMouseEnter={() => select(h.id)}
          >
            <div className="hit-title">{h.title}</div>
            {h.snippet && (
              <div className="hit-snippet">
                {h.snippet.before}
                <mark>{h.snippet.match}</mark>
                {h.snippet.after}
              </div>
            )}
            {h.folder && <div className="hit-folder">{h.folder}</div>}
          </button>
        ))}
        {query && hits.length === 0 && <div className="search-empty">No matches.</div>}
      </div>
    </div>
  );
}
