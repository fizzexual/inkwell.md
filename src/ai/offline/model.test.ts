// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// a fake Rust side: the four offline_model_* commands and the progress event
const h = vi.hoisted(() => ({
  disk: { installed: false, bytes_on_disk: 0 },
  calls: [] as string[],
  failDownload: null as string | null,
  progress: null as ((e: { payload: { received: number; total: number } }) => void) | null,
}));
const TOTAL = 1000;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    h.calls.push(cmd);
    const status = () => ({ ...h.disk, downloading: false, total_bytes: TOTAL });
    switch (cmd) {
      case "offline_model_status":
        return status();
      case "offline_model_download":
        h.progress?.({ payload: { received: 400, total: TOTAL } });
        if (h.failDownload) {
          h.disk.bytes_on_disk = 400;
          throw h.failDownload;
        }
        h.progress?.({ payload: { received: TOTAL, total: TOTAL } });
        h.disk = { installed: true, bytes_on_disk: TOTAL };
        return status();
      case "offline_model_cancel":
        return;
      case "offline_model_delete": {
        const freed = h.disk.bytes_on_disk;
        h.disk = { installed: false, bytes_on_disk: 0 };
        return freed;
      }
    }
    throw new Error(`unexpected ${cmd}`);
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, cb: typeof h.progress) => {
    h.progress = cb;
    return () => (h.progress = null);
  }),
}));

async function boot(desktop = true) {
  const w = window as unknown as Record<string, unknown>;
  if (desktop) w.__TAURI_INTERNALS__ = {};
  else delete w.__TAURI_INTERNALS__;
  vi.resetModules();
  return import("./model");
}

beforeEach(() => {
  h.disk = { installed: false, bytes_on_disk: 0 };
  h.calls.length = 0;
  h.failDownload = null;
  h.progress = null;
});

describe("offline model store (download / availability)", () => {
  it("is absent until downloaded, then ready; the provider is only available when ready", async () => {
    const { useOfflineModel, offlineUnavailableReason } = await boot();
    await useOfflineModel.getState().refresh();
    expect(useOfflineModel.getState().status).toBe("absent");
    expect(offlineUnavailableReason(useOfflineModel.getState())).toMatch(/download/i);

    const seen: number[] = [];
    const unsub = useOfflineModel.subscribe((s) => seen.push(s.received));
    await useOfflineModel.getState().download();
    unsub();
    expect(seen).toContain(400); // progress events reach the UI
    expect(useOfflineModel.getState()).toMatchObject({ status: "ready", received: TOTAL, total: TOTAL });
    expect(offlineUnavailableReason(useOfflineModel.getState())).toBeNull();
  });

  it("a failed or cancelled download is not 'ready': it shows the error and the part already on disk", async () => {
    const { useOfflineModel, offlineUnavailableReason } = await boot();
    h.failDownload = "Download check failed — onnx/model.onnx: sha256 abc, expected def";
    await useOfflineModel.getState().download();
    const s = useOfflineModel.getState();
    expect(s.status).toBe("partial");
    expect(s.error).toContain("sha256");
    expect(s.onDisk).toBe(400);
    expect(offlineUnavailableReason(s)).not.toBeNull();
  });

  it("Cancel asks Rust to stop; Delete frees the disk and makes the provider unavailable again", async () => {
    const { useOfflineModel } = await boot();
    await useOfflineModel.getState().download();
    await useOfflineModel.getState().cancel();
    expect(h.calls).toContain("offline_model_cancel");
    const freed = await useOfflineModel.getState().remove();
    expect(freed).toBe(TOTAL);
    expect(useOfflineModel.getState()).toMatchObject({ status: "absent", onDisk: 0 });
  });

  it("the browser build has no downloader: the provider says it needs the desktop app", async () => {
    const { useOfflineModel, offlineUnavailableReason } = await boot(false);
    await useOfflineModel.getState().refresh();
    expect(useOfflineModel.getState().status).toBe("unsupported");
    expect(offlineUnavailableReason(useOfflineModel.getState())).toMatch(/desktop app/i);
    expect(h.calls).toEqual([]);
  });

  it("the download button shows the real size of the pinned files", async () => {
    const { downloadSizeMb } = await boot();
    const model = (await import("../../ml/chat-model.json")).default;
    const bytes = model.files.reduce((n: number, f: { size: number }) => n + f.size, 0);
    expect(downloadSizeMb()).toBe(Math.round(bytes / 1e6));
  });
});
