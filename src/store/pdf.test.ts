// @vitest-environment jsdom
// Opening PDFs from page links: same file → jump; vault file → read from disk; otherwise explain.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ desktop: false, readAttachment: vi.fn() }));
vi.mock("../vault/disk", async (orig) => ({ ...(await orig<typeof import("../vault/disk")>()), isTauri: () => h.desktop }));
vi.mock("../vault/attachments", () => ({ readAttachment: h.readAttachment, writeAttachment: vi.fn() }));

const tick = () => new Promise((r) => setTimeout(r, 0));
async function load() {
  vi.resetModules();
  return (await import("./useVault")).useVault;
}
const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const lastToast = (v: Awaited<ReturnType<typeof load>>) => v.getState().toasts.at(-1)?.message ?? "";

beforeEach(() => {
  localStorage.clear();
  h.desktop = false;
  h.readAttachment.mockReset();
});

describe("openPdfLink", () => {
  it("a link to the open PDF jumps to that page without reading anything", async () => {
    const v = await load();
    v.getState().openPdf("paper.pdf", buf("a"), "Attachments/paper.pdf");
    v.setState({ centerView: "article" });
    await v.getState().openPdfLink("Attachments/paper.pdf", 12);
    expect(v.getState().pdfTarget?.page).toBe(12);
    expect(v.getState().centerView).toBe("pdf");
    expect(h.readAttachment).not.toHaveBeenCalled();
    // the same page again still jumps (the user may have scrolled away)
    const n = v.getState().pdfTarget!.n;
    await v.getState().openPdfLink("Attachments/paper.pdf", 12);
    expect(v.getState().pdfTarget!.n).toBe(n + 1);
  });

  it("desktop with a vault: another PDF is read from the vault and opened at the page", async () => {
    h.desktop = true;
    h.readAttachment.mockResolvedValue(buf("other"));
    const v = await load();
    v.setState({ loadedVault: "D:/Vault" });
    await v.getState().openPdfLink("Attachments/other.pdf", 5);
    expect(h.readAttachment).toHaveBeenCalledWith("Attachments/other.pdf");
    const s = v.getState();
    expect(s.pdf?.rel).toBe("Attachments/other.pdf");
    expect(s.pdf?.name).toBe("other.pdf");
    expect(new TextDecoder().decode(s.pdf!.data)).toBe("other");
    expect(s.pdfTarget?.page).toBe(5);
    expect(s.centerView).toBe("pdf");
  });

  it("a PDF missing from the vault: says so and keeps the open PDF", async () => {
    h.desktop = true;
    h.readAttachment.mockRejectedValue("Attachment not found: Attachments/gone.pdf");
    const v = await load();
    v.setState({ loadedVault: "D:/Vault" });
    v.getState().openPdf("paper.pdf", buf("a"), "Attachments/paper.pdf");
    const ok = await v.getState().openPdfLink("Attachments/gone.pdf", 2);
    expect(ok).toBe(false);
    expect(v.getState().pdf?.rel).toBe("Attachments/paper.pdf");
    expect(lastToast(v)).toMatch(/gone\.pdf/);
  });

  it("browser build: a name-only link jumps within the open PDF of that name", async () => {
    const v = await load();
    v.getState().openPdf("paper.pdf", buf("a"));
    await v.getState().openPdfLink("paper.pdf", 3);
    expect(v.getState().pdfTarget?.page).toBe(3);
    expect(h.readAttachment).not.toHaveBeenCalled();
  });

  it("browser build / no vault: a link to a PDF that isn't open explains what to do", async () => {
    const v = await load();
    const ok = await v.getState().openPdfLink("Attachments/paper.pdf", 4);
    expect(ok).toBe(false);
    expect(h.readAttachment).not.toHaveBeenCalled();
    expect(v.getState().pdf).toBeNull();
    expect(lastToast(v)).toMatch(/paper\.pdf.*isn.t open/);
  });

  it("desktop without a vault folder: no disk read, explains instead", async () => {
    h.desktop = true;
    const v = await load();
    const ok = await v.getState().openPdfLink("Attachments/paper.pdf", 4);
    expect(ok).toBe(false);
    expect(h.readAttachment).not.toHaveBeenCalled();
  });
});

describe("the open PDF across a reload", () => {
  it("a PDF stored in the vault is remembered by its path", async () => {
    const v = await load();
    v.getState().openPdf("paper.pdf", buf("a"), "Attachments/paper.pdf");
    await tick();
    const after = await load();
    expect(after.getState().pdfRel).toBe("Attachments/paper.pdf");
    expect(after.getState().pdf).toBeNull(); // the bytes are read back from the vault, not stored
  });

  it("a PDF opened without a vault is not remembered", async () => {
    const v = await load();
    v.getState().openPdf("paper.pdf", buf("a"), "Attachments/paper.pdf");
    v.getState().openPdf("loose.pdf", buf("b"));
    await tick();
    expect((await load()).getState().pdfRel).toBeNull();
  });
});
