import { useEffect, useState } from "react";
import { Download, Trash2, X } from "lucide-react";
import { downloadSizeMb, useOfflineModel } from "../ai/offline/model";
import "./OfflineModelRow.css";

const mb = (bytes: number) => Math.round(bytes / 1e6);

/** The "Inkwell offline" card body: download / progress / delete of the on-device chat model. */
export default function OfflineModelRow() {
  const status = useOfflineModel((s) => s.status);
  const received = useOfflineModel((s) => s.received);
  const total = useOfflineModel((s) => s.total);
  const onDisk = useOfflineModel((s) => s.onDisk);
  const error = useOfflineModel((s) => s.error);
  const refresh = useOfflineModel((s) => s.refresh);
  const download = useOfflineModel((s) => s.download);
  const cancel = useOfflineModel((s) => s.cancel);
  const remove = useOfflineModel((s) => s.remove);
  const [freed, setFreed] = useState<number | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = () => {
    setFreed(null);
    void download();
  };

  let body;
  if (status === "unsupported") {
    body = <span className="km-local">Runs in the Inkwell desktop app only.</span>;
  } else if (status === "downloading") {
    const pct = total ? Math.min(100, (received / total) * 100) : 0;
    body = (
      <>
        <div className="om-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="om-count">
          {mb(received)} / {mb(total)} MB
        </span>
        <button className="km-key-btn" title="Cancel download (keeps what's downloaded so far)" onClick={() => void cancel()}>
          <X size={14} />
          <span className="om-sr">Cancel</span>
        </button>
      </>
    );
  } else if (status === "ready") {
    body = (
      <>
        <span className="km-local">Downloaded · {mb(onDisk)} MB on this PC · no internet needed to chat.</span>
        <button
          className="om-btn danger"
          onClick={async () => {
            try {
              setFreed(await remove());
            } catch {
              await refresh();
            }
          }}
        >
          <Trash2 size={13} /> Delete model (frees {mb(onDisk)} MB)
        </button>
      </>
    );
  } else {
    body = (
      <>
        <button className="om-btn" onClick={start} disabled={status === "unknown"}>
          <Download size={13} />{" "}
          {status === "partial"
            ? `Resume download (${mb(onDisk)} of ${downloadSizeMb()} MB)`
            : `Download offline chat model (~${downloadSizeMb()} MB)`}
        </button>
        <span className="km-local">
          {freed != null ? `Deleted — freed ${mb(freed)} MB. ` : ""}One-time download from Hugging Face.
        </span>
      </>
    );
  }

  return (
    <div className="om" onClick={(e) => e.stopPropagation()}>
      <div className="km-key-row">{body}</div>
      {error && status !== "ready" && <div className="om-error">{error}</div>}
      <p className="om-note">Reads only the notes local search finds for each question; it can't edit notes.</p>
    </div>
  );
}
