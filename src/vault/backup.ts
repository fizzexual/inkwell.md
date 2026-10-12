// Vault backups (desktop, disk vaults only): Rust zips the vault into the app's backups folder.
// One is made automatically when a vault opens and the newest is a day old; never in the way.
import { useVault } from "../store/useVault";
import {
  isTauri,
  backupVault,
  listBackups,
  restoreBackup,
  openRestoredVault,
  readVault,
  readVaultDirs,
  diskNoteToNote,
} from "./disk";
import { flushDiskSync } from "./sync";

const DAY = 24 * 3600_000;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Whether a new automatic backup is due, given when the newest was made (null = none yet). */
export function backupDue(lastMs: number | null, nowMs: number): boolean {
  if (lastMs === null) return true;
  // a backup dated over a day ahead means the clock was wrong when it was made: don't wait for it
  return nowMs - lastMs >= DAY || lastMs - nowMs > DAY;
}

/** Make a backup if one is due. Never throws; a failure is a toast. Returns whether one was made. */
export async function autoBackup(nowMs = Date.now()): Promise<boolean> {
  try {
    const list = await listBackups();
    if (!backupDue(list[0]?.time ?? null, nowMs)) return false;
    await backupVault();
    return true;
  } catch (e) {
    console.error("Inkwell: automatic backup failed", e);
    useVault.getState().toast(`Automatic backup failed: ${errText(e)}`);
    return false;
  }
}

/** Check for a due backup each time a disk vault is opened (in the background). */
export function startAutoBackup() {
  if (!isTauri()) return;
  let seen: string | null = null;
  const check = (path: string | null) => {
    if (path === seen) return;
    seen = path;
    if (path) void autoBackup();
  };
  check(useVault.getState().loadedVault);
  useVault.subscribe((s) => check(s.loadedVault));
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "Back up now": the latest edits are saved first, then zipped. */
export async function backupNowFlow() {
  const v = useVault.getState();
  try {
    await flushDiskSync();
    const b = await backupVault();
    v.toast(`Backed up ${plural(b.notes, "note")} · ${b.name}`);
  } catch (e) {
    v.toast(`Backup failed: ${errText(e)}`);
  }
}

/** Extract a backup into a new folder next to the vault. Returns that folder, or throws. */
export const restoreBackupFlow = (name: string) => restoreBackup(name);

/** Switch to the folder the last restore made (no folder picker: Rust remembers it). */
export async function openRestoredFlow() {
  const v = useVault.getState();
  try {
    await flushDiskSync(); // the current vault's last edits, before switching away from it
    const path = await openRestoredVault();
    if (!path) return;
    const [disk, dirs] = await Promise.all([readVault(), readVaultDirs().catch(() => [] as string[])]);
    useVault.getState().loadDiskVault(path, disk.map(diskNoteToNote), dirs);
    v.toast(`Opened the restored vault · ${plural(disk.length, "note")}`);
  } catch (e) {
    v.toast(`Couldn't open the restored folder: ${errText(e)}`);
  }
}
