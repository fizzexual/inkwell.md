// Bridge to the Rust attachment commands (PDFs/images stored inside the open vault folder).
// The bytes travel raw over IPC (no JSON number arrays); the vault-relative path goes in a header.

async function core() {
  return import("@tauri-apps/api/core");
}

/**
 * Copy `data` into the vault at `rel` (e.g. `Attachments/paper.pdf`). Never replaces a different
 * file: Rust picks `paper-1.pdf`… instead (or reuses the same bytes). Returns the path used.
 */
export async function writeAttachment(rel: string, data: ArrayBuffer): Promise<string> {
  const { invoke } = await core();
  return invoke<string>("write_attachment", new Uint8Array(data), { headers: { "x-rel": encodeURIComponent(rel) } });
}

/** The bytes of an attachment in the vault. */
export async function readAttachment(rel: string): Promise<ArrayBuffer> {
  const { invoke } = await core();
  return invoke<ArrayBuffer>("read_attachment", { rel });
}

/** A PDF in the vault's Attachments/ folder: size + modification time (ms) tell when it changed. */
export interface PdfFileInfo {
  rel: string;
  size: number;
  modified: number;
}

/** Every PDF under the open vault's Attachments/ folder. */
export async function listPdfAttachments(): Promise<PdfFileInfo[]> {
  const { invoke } = await core();
  return invoke<PdfFileInfo[]>("list_pdf_attachments");
}
