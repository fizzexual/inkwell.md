import type { FrontmatterData } from "../markdown";
import "./PropertiesPanel.css";

const ICON: Record<string, string> = {
  type: "◆",
  area: "▣",
  status: "◐",
  authors: "✎",
  year: "◷",
  tags: "#",
};

export default function PropertiesPanel({ data }: { data: FrontmatterData }) {
  const keys = Object.keys(data);
  if (!keys.length) return null;

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
              ) : (
                v
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
