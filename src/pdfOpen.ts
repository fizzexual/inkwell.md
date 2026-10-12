import { useVault } from "./store/useVault";
import { isTauri } from "./vault/disk";
import { writeAttachment } from "./vault/attachments";
import { attachmentRel } from "./pdfLinks";

/**
 * Open a PDF the user picked from disk. Desktop with a vault folder: the PDF is copied into the
 * vault (Attachments/), so it — and the page links in its highlights note — still work after a
 * restart. Every "open a PDF" control goes through here so none of them can skip the copy.
 */
export async function openPdfFile(file: File): Promise<void> {
  const { openPdf, toast, loadedVault } = useVault.getState();
  const buf = await file.arrayBuffer();
  if (!isTauri() || !loadedVault) return openPdf(file.name, buf);
  try {
    const rel = await writeAttachment(attachmentRel(file.name), buf.slice(0));
    openPdf(rel.slice(rel.lastIndexOf("/") + 1), buf, rel);
  } catch (err) {
    toast(
      `Couldn't copy “${file.name}” into the vault (${typeof err === "string" ? err : ((err as Error)?.message ?? String(err))}) — it is open, but won't be there after a restart.`,
    );
    openPdf(file.name, buf);
  }
}
