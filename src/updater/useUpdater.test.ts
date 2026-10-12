import { beforeEach, describe, expect, it, vi } from "vitest";

// the Tauri plugins, the disk flush and the app toast are all mocked: these tests pin the flow
const h = vi.hoisted(() => ({
  order: [] as string[],
  check: (async () => null) as () => Promise<unknown>,
  install: (async () => {}) as (cb: (e: unknown) => void) => Promise<void>,
  toasts: [] as string[],
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => h.check() }));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: async () => void h.order.push("relaunch"),
}));
vi.mock("../vault/sync", () => ({
  flushDiskSync: async () => void h.order.push("flush"),
}));
vi.mock("../store/useVault", () => ({
  useVault: { getState: () => ({ toast: (m: string) => void h.toasts.push(m) }) },
}));

const fakeUpdate = (version = "0.2.0") => ({
  version,
  body: "notes",
  downloadAndInstall: (cb: (e: unknown) => void) => h.install(cb),
});

async function fresh() {
  vi.resetModules();
  return (await import("./useUpdater")).useUpdater;
}

beforeEach(() => {
  h.order = [];
  h.toasts = [];
  h.check = async () => null;
  h.install = async () => {};
});

describe("checking", () => {
  it("an update found by the automatic check shows the banner and installs nothing", async () => {
    const useUpdater = await fresh();
    h.check = async () => fakeUpdate();
    await useUpdater.getState().checkForUpdates("auto");
    const s = useUpdater.getState();
    expect(s.phase).toBe("available");
    expect(s.text).toBe("Inkwell 0.2.0 is available");
    expect(h.order).toEqual([]); // no flush, no install, no relaunch without the click
    expect(h.toasts).toEqual([]);
  });

  it("automatic check: up to date or offline stays completely silent", async () => {
    const useUpdater = await fresh();
    await useUpdater.getState().checkForUpdates("auto");
    expect(useUpdater.getState().phase).toBe("idle");
    h.check = async () => {
      throw new Error("404");
    };
    await useUpdater.getState().checkForUpdates("auto");
    expect(useUpdater.getState().phase).toBe("idle");
    expect(h.toasts).toEqual([]);
  });

  it("manual check answers with a toast when there is nothing new or it fails", async () => {
    const useUpdater = await fresh();
    await useUpdater.getState().checkForUpdates("manual");
    h.check = async () => {
      throw new Error("offline");
    };
    await useUpdater.getState().checkForUpdates("manual");
    expect(h.toasts).toEqual(["You're up to date", "Couldn't check for updates — are you online?"]);
    expect(useUpdater.getState().phase).toBe("idle");
  });

  it("a manual check after dismissing the banner brings it back", async () => {
    const useUpdater = await fresh();
    h.check = async () => fakeUpdate();
    await useUpdater.getState().checkForUpdates("auto");
    useUpdater.getState().dismiss();
    expect(useUpdater.getState().phase).toBe("idle");
    await useUpdater.getState().checkForUpdates("manual");
    expect(useUpdater.getState().phase).toBe("available");
  });

  it("a check while a download is running is ignored (it never replaces the update being installed)", async () => {
    const useUpdater = await fresh();
    h.check = async () => fakeUpdate();
    await useUpdater.getState().checkForUpdates("auto");
    let finish = () => {};
    h.install = () => new Promise<void>((r) => (finish = r));
    const installing = useUpdater.getState().install();
    await new Promise((r) => setTimeout(r, 0));
    let calls = 0;
    h.check = async () => (calls++, fakeUpdate("9.9.9"));
    await useUpdater.getState().checkForUpdates("manual");
    expect(calls).toBe(0);
    expect(useUpdater.getState().phase).toBe("downloading");
    finish();
    await installing;
  });
});

describe("installing (only on the click)", () => {
  it("saves pending note edits, downloads with progress, then relaunches", async () => {
    const useUpdater = await fresh();
    h.check = async () => fakeUpdate();
    await useUpdater.getState().checkForUpdates("auto");
    const seen: string[] = [];
    h.install = async (cb) => {
      h.order.push("download");
      cb({ event: "Started", data: { contentLength: 1000 } });
      seen.push(useUpdater.getState().text);
      cb({ event: "Progress", data: { chunkLength: 425 } });
      seen.push(useUpdater.getState().text);
      cb({ event: "Progress", data: { chunkLength: 575 } });
      seen.push(useUpdater.getState().text);
      cb({ event: "Finished" });
      seen.push(useUpdater.getState().text);
    };
    await useUpdater.getState().install();
    expect(h.order).toEqual(["flush", "download", "relaunch"]);
    expect(seen).toEqual(["Downloading… 0%", "Downloading… 42%", "Downloading… 100%", "Installing…"]);
  });

  it("a failed download keeps the banner with a retry, and does not relaunch", async () => {
    const useUpdater = await fresh();
    h.check = async () => fakeUpdate();
    await useUpdater.getState().checkForUpdates("auto");
    h.install = async () => {
      throw new Error("signature mismatch");
    };
    await useUpdater.getState().install();
    const s = useUpdater.getState();
    expect(s.phase).toBe("available");
    expect(s.text).toBe("Update failed — try again");
    expect(h.order).toEqual(["flush"]);
  });

  it("install without a found update does nothing", async () => {
    const useUpdater = await fresh();
    await useUpdater.getState().install();
    expect(h.order).toEqual([]);
    expect(useUpdater.getState().phase).toBe("idle");
  });

  it("a second click while downloading does not start a second download", async () => {
    const useUpdater = await fresh();
    h.check = async () => fakeUpdate();
    await useUpdater.getState().checkForUpdates("auto");
    let downloads = 0;
    let finish = () => {};
    h.install = () => (downloads++, new Promise<void>((r) => (finish = r)));
    const first = useUpdater.getState().install();
    await new Promise((r) => setTimeout(r, 0));
    await useUpdater.getState().install();
    finish();
    await first;
    expect(downloads).toBe(1);
  });
});
