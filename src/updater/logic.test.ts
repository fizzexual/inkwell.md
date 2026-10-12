import { describe, expect, it, vi } from "vitest";
import {
  AUTO_CHECK_DELAY_MS,
  present,
  progressText,
  scheduleAutoCheck,
  shouldAutoCheck,
  toOutcome,
  updatesEnabled,
} from "./logic";

describe("when Inkwell looks for updates", () => {
  it("only the installed desktop app (Tauri + production build) checks", () => {
    expect(updatesEnabled({ inTauri: true, prod: true })).toBe(true);
    expect(updatesEnabled({ inTauri: true, prod: false })).toBe(false); // tauri dev
    expect(updatesEnabled({ inTauri: false, prod: true })).toBe(false); // vite preview in a browser
    expect(updatesEnabled({ inTauri: false, prod: false })).toBe(false);
    expect(shouldAutoCheck({ inTauri: true, prod: true })).toBe(true);
    expect(shouldAutoCheck({ inTauri: true, prod: false })).toBe(false);
  });

  it("the automatic check runs once, about 10 s after launch, and can be cancelled", () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn();
      scheduleAutoCheck({ inTauri: true, prod: true }, run);
      vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS - 1);
      expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(run).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS * 10);
      expect(run).toHaveBeenCalledTimes(1);

      const cancelled = vi.fn();
      const cancel = scheduleAutoCheck({ inTauri: true, prod: true }, cancelled);
      cancel();
      vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS * 2);
      expect(cancelled).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    expect(AUTO_CHECK_DELAY_MS).toBe(10_000);
  });

  it("no automatic check is scheduled in dev or in a browser", () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn();
      scheduleAutoCheck({ inTauri: true, prod: false }, run);
      scheduleAutoCheck({ inTauri: false, prod: true }, run);
      vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS * 5);
      expect(run).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("turning the plugin's answer into an outcome", () => {
  it("an update object means an update is available, with its version", async () => {
    const o = await toOutcome(async () => ({ version: "0.2.0", body: "Fixes" }));
    expect(o).toEqual({ kind: "available", version: "0.2.0", notes: "Fixes" });
  });

  it("null means up to date", async () => {
    expect(await toOutcome(async () => null)).toEqual({ kind: "none" });
  });

  it("a thrown error (offline, 404 before the first release, bad signature) is an error outcome, never a crash", async () => {
    const o = await toOutcome(async () => {
      throw new Error("Could not fetch a valid release JSON from the remote");
    });
    expect(o).toEqual({ kind: "error", message: "Could not fetch a valid release JSON from the remote" });
    const s = await toOutcome(async () => {
      throw "network down";
    });
    expect(s).toEqual({ kind: "error", message: "network down" });
  });
});

describe("what the user sees for each outcome", () => {
  it("an available update shows the persistent banner on both kinds of check", () => {
    for (const trigger of ["auto", "manual"] as const) {
      expect(present({ kind: "available", version: "0.2.0" }, trigger)).toEqual({
        show: "banner",
        version: "0.2.0",
        text: "Inkwell 0.2.0 is available",
      });
    }
  });

  it("the automatic check stays silent when there is nothing new or it fails", () => {
    expect(present({ kind: "none" }, "auto")).toEqual({ show: "nothing" });
    expect(present({ kind: "error", message: "offline" }, "auto")).toEqual({ show: "nothing" });
  });

  it("the manual check always answers", () => {
    expect(present({ kind: "none" }, "manual")).toEqual({ show: "toast", text: "You're up to date" });
    expect(present({ kind: "error", message: "offline" }, "manual")).toEqual({
      show: "toast",
      text: "Couldn't check for updates — are you online?",
    });
  });
});

describe("download progress text", () => {
  it("shows a percentage when the size is known", () => {
    expect(progressText(0, 1000)).toBe("Downloading… 0%");
    expect(progressText(425, 1000)).toBe("Downloading… 42%");
    expect(progressText(1000, 1000)).toBe("Downloading… 100%");
    expect(progressText(1500, 1000)).toBe("Downloading… 100%");
  });

  it("shows megabytes when the server sent no size", () => {
    expect(progressText(3_250_000)).toBe("Downloading… 3.1 MB");
    expect(progressText(3_250_000, 0)).toBe("Downloading… 3.1 MB");
    expect(progressText(0)).toBe("Downloading…");
  });
});
