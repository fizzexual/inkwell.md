// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

async function markup(state: Record<string, unknown>) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  vi.resetModules();
  const { useOfflineModel, downloadSizeMb } = await import("../ai/offline/model");
  // keep the mount-time refresh from replacing the state under test
  useOfflineModel.setState({ ...state, refresh: async () => {} });
  const { default: OfflineModelRow } = await import("./OfflineModelRow");
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(createElement(OfflineModelRow)));
  const html = host.textContent ?? "";
  await act(async () => root.unmount());
  return { html, mb: downloadSizeMb() };
}

describe("offline model row in AI providers", () => {
  it("not downloaded: one button with the real download size, and says it can't edit notes", async () => {
    const { html, mb } = await markup({ status: "absent", onDisk: 0 });
    expect(html).toContain(`Download offline chat model (~${mb} MB)`);
    expect(html.toLowerCase()).toContain("can't edit");
  });

  it("downloading: progress in MB and a Cancel button", async () => {
    const { html } = await markup({ status: "downloading", received: 290_000_000, total: 580_000_000 });
    expect(html).toContain("290 / 580 MB");
    expect(html).toContain("Cancel");
  });

  it("a stopped download offers to resume and shows why it stopped", async () => {
    const { html } = await markup({ status: "partial", onDisk: 100_000_000, error: "Download cancelled" });
    expect(html).toContain("Resume download");
    expect(html).toContain("Download cancelled");
  });

  it("downloaded: works offline, and Delete says how much it frees", async () => {
    const { html } = await markup({ status: "ready", onDisk: 580_000_000 });
    expect(html).toContain("Delete model (frees 580 MB)");
    expect(html.toLowerCase()).toContain("no internet");
  });

  it("browser build: explains it needs the desktop app, no download button", async () => {
    const { html } = await markup({ status: "unsupported" });
    expect(html).toContain("desktop app");
    expect(html).not.toContain("Download offline chat model");
  });
});
