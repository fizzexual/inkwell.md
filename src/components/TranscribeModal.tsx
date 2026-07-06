import { useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { transcribe, isAsrReady, type TranscribeProgress } from "../audio/transcribe";
import { Mic } from "lucide-react";
import "./TranscribeModal.css";

export default function TranscribeModal() {
  const open = useVault((s) => s.transcribeOpen);
  const setOpen = useVault((s) => s.setTranscribeOpen);
  const createNoteWith = useVault((s) => s.createNoteWith);
  const openArticle = useVault((s) => s.openArticle);
  const toast = useVault((s) => s.toast);

  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const run = async (file: File) => {
    setBusy(true);
    setErr(null);
    setText("");
    setFileName(file.name);
    try {
      const out = await transcribe(file, setProgress);
      setText(out || "(no speech detected)");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) run(f);
    e.target.value = "";
  };

  const saveNote = () => {
    const title = fileName.replace(/\.[^.]+$/, "") || "Transcript";
    const body = `# ${title}\n\n_Transcribed from ${fileName}_\n\n${text}\n`;
    createNoteWith(title, body, "Transcripts");
    const id = useVault.getState().resolve(title);
    if (id) openArticle(id);
    setOpen(false);
    toast("Transcript saved to Transcripts/");
  };

  const pct = progress?.ratio != null ? Math.round(progress.ratio * 100) : null;

  return (
    <div className="tr-backdrop" onMouseDown={() => !busy && setOpen(false)}>
      <div className="tr" onMouseDown={(e) => e.stopPropagation()}>
        <header className="tr-head">
          <Mic size={16} />
          <h2>Transcribe audio</h2>
          <button className="tr-x" aria-label="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </header>

        <div className="tr-body">
          <p className="tr-note">
            Turn a recording (lecture, meeting, voice memo) into a note. Runs entirely on your device —
            nothing is uploaded. {isAsrReady() ? "" : "First run downloads a small model (~40MB)."}
          </p>

          {!busy && !text && (
            <label className="tr-pick">
              <Mic size={15} />
              Choose an audio file
              <input ref={inputRef} type="file" accept="audio/*,video/*" onChange={onFile} hidden />
            </label>
          )}

          {busy && (
            <div className="tr-status">
              <span className="tr-spin" />
              <span>
                {progress?.stage === "download"
                  ? `Loading model… ${pct ?? 0}%`
                  : progress?.stage === "decoding"
                    ? "Decoding audio…"
                    : progress?.stage === "transcribing"
                      ? "Transcribing… (this can take a moment)"
                      : "Working…"}
              </span>
            </div>
          )}

          {err && <div className="tr-err">{err}</div>}

          {text && !busy && (
            <>
              <div className="tr-file">{fileName}</div>
              <textarea className="tr-text" value={text} onChange={(e) => setText(e.target.value)} rows={10} />
              <div className="tr-actions">
                <button className="tr-secondary" onClick={() => setText("")}>
                  Transcribe another
                </button>
                <button className="tr-save" onClick={saveNote}>
                  Save as note
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
