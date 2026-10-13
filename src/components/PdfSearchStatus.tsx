import { useEffect } from "react";
import { useVault } from "../store/useVault";
import { isTauri } from "../vault/disk";
import { pdfStatus, syncPdfIndex, usePdfIndex } from "../search/pdfIndex";
import "./PdfSearchStatus.css";

/** Re-check the vault's PDFs (new / changed / deleted) while a search panel is open. */
export function useSyncPdfIndex(active = true) {
  const loadedVault = useVault((s) => s.loadedVault);
  useEffect(() => {
    if (active && loadedVault && isTauri()) void syncPdfIndex(loadedVault);
  }, [active, loadedVault]);
}

const list = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", "));

/** One quiet line under a search box: PDFs still being read, scans and unreadable PDFs. */
export default function PdfSearchStatus() {
  const docs = usePdfIndex((s) => s.docs);
  const pending = usePdfIndex((s) => s.pending);
  const failed = usePdfIndex((s) => s.failed);
  const st = pdfStatus({ vault: null, ready: true, docs, pending, failed });
  if (!st.pending && !st.scanned.length && !st.failed.length) return null;
  return (
    <div className="pdf-status">
      {st.pending > 0 && <span>Reading PDFs… {st.pending} left</span>}
      {st.scanned.length > 0 && (
        <span title="Only text in a PDF can be searched — these pages are images">
          {list(st.scanned)}: no searchable text (scanned)
        </span>
      )}
      {st.failed.length > 0 && <span>Couldn't read {list(st.failed)}</span>}
    </div>
  );
}
