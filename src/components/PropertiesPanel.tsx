import { useState } from "react";
import { useVault } from "../store/useVault";
import type { FrontmatterData } from "../markdown";
import "./PropertiesPanel.css";

const ICON: Record<string, string> = {
  type: "◆",
  area: "▣",
  status: "◐",
  authors: "✎",
  year: "◷",
  venue: "▤",
  citekey: "@",
  tags: "#",
};

export default function PropertiesPanel({ data, noteId }: { data: FrontmatterData; noteId: string }) {
  const setProperty = useVault((s) => s.setProperty);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const keys = Object.keys(data);
  if (!keys.length) return null;

  const startEdit = (key: string, value: string) => {
    setEditing(key);
    setDraft(value);
  };
  const commit = () => {
    if (editing) setProperty(noteId, editing, draft.trim());
    setEditing(null);
  };

  return (
    <div className="properties">
      {keys.map((k) => {
        const v = data[k];
        return (
          <div className="prop-row" key={k}>
            <span className="prop-key">
              <span className="prop-icon">{ICON[k] ?? "•"}</span>
              {k}
            </span>
            <span className="prop-val">
              {Array.isArray(v) ? (
                v.length ? (
                  v.map((item) => (
                    <span className="prop-pill" key={item}>
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="prop-empty">—</span>
                )
              ) : editing === k ? (
                <input
                  className="prop-input"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <span className="prop-editable" onClick={() => startEdit(k, String(v))}>
                  {v}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
