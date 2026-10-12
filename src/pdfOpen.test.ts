// @vitest-environment jsdom
// Every way of opening a PDF from disk (sidebar toolbar, PDF view) must copy it into the vault.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ desktop: false, writeAttachment: vi.fn() }));
vi.mock("./vault/disk", async (orig) => ({ ...(await orig<typeof import("./vault/disk")>()), isTauri: () => h.desktop }));
vi.mock("./vault/attachments", () => ({ writeAttachment: h.writeAttachment, readAttachment: vi.fn() }));

import { useVault } from "./store/useVault";
import { openPdfFile } from "./pdfOpen";

// jsdom's File has no arrayBuffer(); the app only needs name + arrayBuffer
const file = (name: string) =>
  ({ name, arrayBuffer: async () => new TextEncoder().encode("%PDF-1.4 test").buffer }) as unknown as File;

beforeEach(() => {
  h.desktop = false;
  h.writeAttachment.mockReset();
  useVault.setState({ loadedVault: null, pdf: null, pdfRel: null });
});

describe("openPdfFile", () => {
  it("desktop with a vault: copies the PDF into Attachments/ and opens that copy", async () => {
    h.desktop = true;
    useVault.setState({ loadedVault: "D:/Vault" });
    h.writeAttachment.mockResolvedValue("Attachments/paper.pdf");
    await openPdfFile(file("paper.pdf"));
    expect(h.writeAttachment).toHaveBeenCalledTimes(1);
    const [rel, bytes] = h.writeAttachment.mock.calls[0];
    expect(rel).toBe("Attachments/paper.pdf");
    expect((bytes as ArrayBuffer).byteLength).toBe("%PDF-1.4 test".length);
    expect(useVault.getState().pdfRel).toBe("Attachments/paper.pdf");
    expect(useVault.getState().pdf?.name).toBe("paper.pdf");
  });

  it("no vault open: just opens it", async () => {
    h.desktop = true;
    await openPdfFile(file("paper.pdf"));
    expect(h.writeAttachment).not.toHaveBeenCalled();
    expect(useVault.getState().pdf?.name).toBe("paper.pdf");
    expect(useVault.getState().pdfRel).toBeNull();
  });

  it("a refused copy still opens the PDF and says it won't survive a restart", async () => {
    h.desktop = true;
    useVault.setState({ loadedVault: "D:/Vault" });
    h.writeAttachment.mockRejectedValue("disk full");
    await openPdfFile(file("paper.pdf"));
    expect(useVault.getState().pdf?.name).toBe("paper.pdf");
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/disk full.*won't be there after a restart/);
  });
});
