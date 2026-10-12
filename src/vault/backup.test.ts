// @vitest-environment jsdom
// Automatic vault backups: when one is due, and that making one never blocks or breaks opening.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  backups: [] as { name: string; time: number; size: number; notes: number }[],
  calls: [] as string[],
  fail: null as null | string,
  release: null as null | (() => void),
}));

vi.mock("./disk", async (orig) => {
  const actual = await orig<typeof import("./disk")>();
  return {
    ...actual,
    isTauri: () => true,
    listBackups: async () => (h.calls.push("list"), [...h.backups]),
    backupVault: async () => {
      h.calls.push("backup");
      if (h.release) await new Promise<void>((r) => (h.release = r));
      if (h.fail) throw h.fail;
      const b = { name: "v-20261012-100000.zip", time: Date.now(), size: 10, notes: 3 };
      h.backups.unshift(b);
      return b;
    },
  };
});

const HOUR = 3600_000;
const NOW = Date.UTC(2026, 9, 12, 12);

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  h.backups = [];
  h.calls = [];
  h.fail = null;
  h.release = null;
});

describe("backupDue", () => {
  it("is due with no backup, or when the newest is 24 h old or more", async () => {
    const { backupDue } = await import("./backup");
    expect(backupDue(null, NOW)).toBe(true);
    expect(backupDue(NOW - 23 * HOUR, NOW)).toBe(false);
    expect(backupDue(NOW - 24 * HOUR, NOW)).toBe(true);
    expect(backupDue(NOW - 30 * 24 * HOUR, NOW)).toBe(true);
  });

  it("a backup dated more than a day in the future (clock was wrong) doesn't stop new ones", async () => {
    const { backupDue } = await import("./backup");
    expect(backupDue(NOW + 2 * HOUR, NOW)).toBe(false);
    expect(backupDue(NOW + 48 * HOUR, NOW)).toBe(true);
  });
});

describe("automatic backup when a disk vault opens", () => {
  it("makes one when none exists, and none when the last is recent", async () => {
    const { autoBackup } = await import("./backup");
    expect(await autoBackup(NOW)).toBe(true);
    expect(h.calls).toEqual(["list", "backup"]);
    h.calls = [];
    h.backups = [{ name: "x", time: NOW - HOUR, size: 1, notes: 1 }];
    expect(await autoBackup(NOW)).toBe(false);
    expect(h.calls).toEqual(["list"]);
  });

  it("a failure shows a toast and doesn't throw", async () => {
    const { autoBackup } = await import("./backup");
    const { useVault } = await import("../store/useVault");
    h.fail = "The disk is full";
    await expect(autoBackup(NOW)).resolves.toBe(false);
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/Automatic backup failed.*disk is full/);
  });

  it("runs in the background: opening the vault never waits for it", async () => {
    const { startAutoBackup } = await import("./backup");
    const { useVault } = await import("../store/useVault");
    h.release = () => {}; // the backup hangs until released
    startAutoBackup();
    useVault.getState().loadDiskVault("C:/v", [{ id: "a.md", title: "A", folder: "", kind: "note", links: [], content: "# A" }]);
    expect(useVault.getState().loadedVault).toBe("C:/v"); // loaded, with the backup still running
    await vi.waitFor(() => expect(h.calls).toEqual(["list", "backup"]));
    h.release!();
  });
});

describe("Back up now", () => {
  it("says what was saved, or why it failed", async () => {
    const { backupNowFlow } = await import("./backup");
    const { useVault } = await import("../store/useVault");
    await backupNowFlow();
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/Backed up 3 notes/);
    h.fail = "Access is denied";
    await backupNowFlow();
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/Backup failed.*Access is denied/);
  });
});
