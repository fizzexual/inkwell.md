import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ order: [] as string[], release: () => {} }));

vi.mock("./vault/sync", () => ({
  flushDiskSync: () =>
    new Promise<void>((r) => {
      h.order.push("flush started");
      h.release = () => {
        h.order.push("flush done");
        r();
      };
    }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ close: async () => void h.order.push("close") }),
}));

describe("windowControl('close')", () => {
  it("waits for pending note edits to reach disk before closing", async () => {
    const { windowControl } = await import("./tauri");
    const closing = windowControl("close");
    await new Promise((r) => setTimeout(r, 10));
    expect(h.order).toEqual(["flush started"]);
    h.release();
    await closing;
    expect(h.order).toEqual(["flush started", "flush done", "close"]);
  });
});
