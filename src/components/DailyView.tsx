import { useMemo, useState } from "react";
import { useVault } from "../store/useVault";
import { ChevronRight } from "../icons";
import "./DailyView.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function DailyView() {
  const notes = useVault((s) => s.notes);
  const openDailyNote = useVault((s) => s.openDailyNote);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const existing = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) if (n.folder === "Daily") set.add(n.title);
    return set;
  }, [notes]);

  const grid = useMemo(() => {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // make Monday = 0
    const days = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    return cells;
  }, [year, month]);

  const step = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setMonth(m);
    setYear(y);
  };

  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <main className="daily-view">
      <header className="daily-header">
        <div className="daily-title">
          <h1>Journal</h1>
          <span className="daily-subtitle">{existing.size} daily notes</span>
        </div>
        <button className="seg-btn" onClick={() => openDailyNote(todayIso)}>
          Open today
        </button>
      </header>

      <div className="daily-body">
        <div className="cal">
          <div className="cal-nav">
            <button onClick={() => step(-1)}>
              <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
            </button>
            <span className="cal-month">
              {MONTHS[month]} {year}
            </span>
            <button onClick={() => step(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="cal-grid">
            {WEEKDAYS.map((w) => (
              <div key={w} className="cal-weekday">
                {w}
              </div>
            ))}
            {grid.map((d, i) =>
              d == null ? (
                <div key={i} className="cal-cell empty" />
              ) : (
                (() => {
                  const dateStr = iso(year, month, d);
                  const has = existing.has(dateStr);
                  const isToday = dateStr === todayIso;
                  return (
                    <button
                      key={i}
                      className={"cal-cell" + (has ? " has" : "") + (isToday ? " today" : "")}
                      onClick={() => openDailyNote(dateStr)}
                    >
                      {d}
                      {has && <span className="cal-dot" />}
                    </button>
                  );
                })()
              ),
            )}
          </div>
          <div className="cal-hint">Click a day to open or create its note</div>
        </div>
      </div>
    </main>
  );
}
