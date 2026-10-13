import { useEffect, useState } from "react";
import { useVault } from "../store/useVault";
import { useHistory } from "../useHistory";
import { useGitHistory, gitLogFor, gitVersionOf, restoreGitVersion, commitNowFlow } from "../vault/gitHistory";
import type { GitCommit } from "../vault/disk";
import { foldContext, lineDiff } from "../ai/lineDiff";
import { History, RotateCcw, Camera, GitCommitHorizontal } from "lucide-react";
import "./HistoryModal.css";

function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const strip = (md: string) =>
  md
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/[#>*`_[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The note's commits in the vault's git repository: what changed since each, and restoring one. */
function GitVersions({ noteId, current, refresh, onRestored }: { noteId: string; current: string; refresh: number; onRestored: () => void }) {
  const toast = useVault((s) => s.toast);
  const [commits, setCommits] = useState<GitCommit[] | null | "loading" | { error: string }>("loading");
  const [sel, setSel] = useState(0);
  const [old, setOld] = useState<string | { error: string } | null>(null);
  const [view, setView] = useState<"changes" | "text">("changes");

  useEffect(() => {
    let live = true;
    setCommits("loading");
    setSel(0);
    gitLogFor(noteId).then(
      (c) => live && setCommits(c),
      (e) => live && setCommits({ error: errText(e) }),
    );
    return () => {
      live = false;
    };
  }, [noteId, refresh]);

  const list = Array.isArray(commits) ? commits : [];
  const picked = list[sel];
  useEffect(() => {
    let live = true;
    setOld(null);
    if (picked)
      gitVersionOf(noteId, picked.id).then(
        (t) => live && setOld(t),
        (e) => live && setOld({ error: errText(e) }),
      );
    return () => {
      live = false;
    };
  }, [noteId, picked?.id]);

  if (commits === "loading") return <div className="hist-empty">Reading the git history…</div>;
  if (commits === null) return <div className="hist-empty">This note isn’t saved to disk yet.</div>;
  if (!Array.isArray(commits)) return <div className="hist-empty">Couldn’t read the git history: {commits.error}</div>;
  if (!list.length)
    return (
      <div className="hist-empty">
        No commits of this note yet. Inkwell commits 2 minutes after you stop editing, or click <b>Commit now</b>.
      </div>
    );

  const restore = async () => {
    if (!picked) return;
    try {
      await restoreGitVersion(noteId, picked.id);
      toast(`Restored the version from ${new Date(picked.time).toLocaleString()}`);
      onRestored();
    } catch (e) {
      toast(`Couldn’t restore that version: ${errText(e)}`);
    }
  };

  return (
    <div className="hist-body">
      <ul className="hist-list">
        {list.map((c, i) => (
          <li key={c.id}>
            <button className={"hist-item" + (i === sel ? " active" : "")} onClick={() => setSel(i)} title={c.id}>
              <span className="hist-time">{ago(c.time)}</span>
              <span className="hist-snippet">{c.summary || c.id.slice(0, 8)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="hist-preview">
        <div className="hist-preview-bar">
          <span>
            {picked ? `${new Date(picked.time).toLocaleString()} · ${picked.author} · ${picked.id.slice(0, 8)}` : ""}
          </span>
          <span className="hist-views">
            <button className={view === "changes" ? "on" : ""} onClick={() => setView("changes")} title="What changed since this version">
              Changes
            </button>
            <button className={view === "text" ? "on" : ""} onClick={() => setView("text")} title="The note as it was">
              Text
            </button>
          </span>
          <button className="hist-restore" onClick={restore} disabled={typeof old !== "string"}>
            <RotateCcw size={13} /> Restore this version
          </button>
        </div>
        {old === null ? (
          <pre className="hist-content">…</pre>
        ) : typeof old !== "string" ? (
          <pre className="hist-content">Couldn’t read this version: {old.error}</pre>
        ) : view === "text" ? (
          <pre className="hist-content">{old}</pre>
        ) : old === current ? (
          <pre className="hist-content hist-same">Same as the note now.</pre>
        ) : (
          <pre className="hist-content">
            {foldContext(lineDiff(old, current), 3).map((l, i) =>
              l.op === "…" ? (
                <div key={i} className="hist-diff-fold">
                  ⋯ {l.text} unchanged line{l.text === "1" ? "" : "s"}
                </div>
              ) : (
                <div key={i} className={l.op === "+" ? "hist-diff-add" : l.op === "-" ? "hist-diff-del" : undefined}>
                  {l.op} {l.text}
                </div>
              ),
            )}
          </pre>
        )}
      </div>
    </div>
  );
}

export default function HistoryModal() {
  const open = useVault((s) => s.historyOpen);
  const setOpen = useVault((s) => s.setHistoryOpen);
  const selectedId = useVault((s) => s.selectedId);
  const note = useVault((s) => s.notesById.get(s.selectedId));
  const updateContent = useVault((s) => s.updateContent);
  const toast = useVault((s) => s.toast);
  const loadedVault = useVault((s) => s.loadedVault);
  const gitOn = useGitHistory((s) => !!loadedVault && s.vaults.includes(loadedVault));
  // NB: apply the ?? [] fallback OUTSIDE the selector — returning a fresh [] inside loops forever
  const versions = useHistory((s) => s.versions[selectedId]) ?? [];
  const record = useHistory((s) => s.record);
  const [sel, setSel] = useState(0);
  const [source, setSource] = useState<"snapshots" | "git">("snapshots");
  const [refresh, setRefresh] = useState(0);

  if (!open) return null;
  const git = source === "git" && !!loadedVault;

  const snapshot = () => {
    if (!note) return;
    record(selectedId, note.content ?? "", Date.now());
    toast("Version saved");
  };
  const commitNow = async () => {
    await commitNowFlow();
    setRefresh((n) => n + 1);
  };
  const restore = (content: string) => {
    if (note) record(selectedId, note.content ?? "", Date.now()); // checkpoint current first
    updateContent(selectedId, content);
    toast("Restored earlier version");
    setOpen(false);
  };

  const current = versions[sel];

  return (
    <div className="hist-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="hist" onMouseDown={(e) => e.stopPropagation()}>
        <header className="hist-head">
          <History size={16} />
          <h2>Version history</h2>
          <span className="hist-note">{note?.title}</span>
          {loadedVault && (
            <span className="hist-views" role="tablist">
              <button role="tab" aria-selected={!git} className={!git ? "on" : ""} onClick={() => setSource("snapshots")}>
                Snapshots
              </button>
              <button role="tab" aria-selected={git} className={git ? "on" : ""} onClick={() => setSource("git")}>
                Git
              </button>
            </span>
          )}
          {git ? (
            gitOn && (
              <button className="hist-snap" onClick={() => void commitNow()} title="Commit the vault's changes now">
                <GitCommitHorizontal size={13} /> Commit now
              </button>
            )
          ) : (
            <button className="hist-snap" onClick={snapshot} title="Save a version now">
              <Camera size={13} /> Save version
            </button>
          )}
          <button className="hist-x" onClick={() => setOpen(false)}>
            ✕
          </button>
        </header>

        {git ? (
          gitOn ? (
            <GitVersions
              noteId={selectedId}
              current={note?.content ?? ""}
              refresh={refresh}
              onRestored={() => setOpen(false)}
            />
          ) : (
            <div className="hist-empty">
              Git history is off for this vault. Turn on <b>Keep git history</b> in the vault menu (click the vault’s
              name) and Inkwell commits your notes to a git repository in the vault folder.
            </div>
          )
        ) : versions.length === 0 ? (
          <div className="hist-empty">
            No saved versions yet. Inkwell snapshots this note as you edit, or click <b>Save version</b> to
            checkpoint it now.
          </div>
        ) : (
          <div className="hist-body">
            <ul className="hist-list">
              {versions.map((v, i) => (
                <li key={v.t}>
                  <button className={"hist-item" + (i === sel ? " active" : "")} onClick={() => setSel(i)}>
                    <span className="hist-time">{ago(v.t)}</span>
                    <span className="hist-snippet">{strip(v.content).slice(0, 60) || "empty"}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="hist-preview">
              <div className="hist-preview-bar">
                <span>{current ? new Date(current.t).toLocaleString() : ""}</span>
                <button className="hist-restore" onClick={() => current && restore(current.content)}>
                  <RotateCcw size={13} /> Restore this version
                </button>
              </div>
              <pre className="hist-content">{current?.content}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
