import { describe, expect, it, vi } from "vitest";
import { loadOnce } from "./loadOnce";

describe("loadOnce", () => {
  it("loads once and shares the result between callers", async () => {
    const load = vi.fn(async () => "model");
    const get = loadOnce(load);
    const [a, b] = await Promise.all([get(), get()]);
    expect([a, b, await get()]).toEqual(["model", "model", "model"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("a failed load (e.g. offline) is retried on the next call, not cached forever", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("model");
    const get = loadOnce(load);
    await expect(get()).rejects.toThrow("offline");
    await expect(get()).resolves.toBe("model");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reports whether the value is ready", async () => {
    let fail = true;
    const get = loadOnce(async () => {
      if (fail) throw new Error("x");
      return 1;
    });
    expect(get.ready()).toBe(false);
    await get().catch(() => {});
    expect(get.ready()).toBe(false);
    fail = false;
    await get();
    expect(get.ready()).toBe(true);
  });
});
