// Auto-update decisions, kept pure so they can be tested without Tauri.
// The flow itself (plugin calls, state) lives in useUpdater.ts.

export type Trigger = "auto" | "manual";

export type CheckOutcome =
  | { kind: "available"; version: string; notes?: string }
  | { kind: "none" }
  | { kind: "error"; message: string };

export type Presentation =
  | { show: "banner"; version: string; text: string }
  | { show: "toast"; text: string }
  | { show: "nothing" };

export interface UpdateEnv {
  /** running inside the Tauri desktop shell (not a plain browser) */
  inTauri: boolean;
  /** a production build (`import.meta.env.PROD`), not `tauri dev` */
  prod: boolean;
}

export const AUTO_CHECK_DELAY_MS = 10_000;

/** Updates exist only for the installed desktop app. */
export function updatesEnabled(env: UpdateEnv): boolean {
  return env.inTauri && env.prod;
}

export const shouldAutoCheck = updatesEnabled;

/** Runs `run` once, AUTO_CHECK_DELAY_MS after launch (if updates are enabled). Returns a cancel. */
export function scheduleAutoCheck(env: UpdateEnv, run: () => void): () => void {
  if (!shouldAutoCheck(env)) return () => {};
  const t = setTimeout(run, AUTO_CHECK_DELAY_MS);
  return () => clearTimeout(t);
}

/** Calls the plugin's `check()` and never throws: offline / 404 / bad JSON become an error outcome. */
export async function toOutcome(
  check: () => Promise<{ version: string; body?: string | null } | null>,
): Promise<CheckOutcome> {
  try {
    const u = await check();
    if (!u) return { kind: "none" };
    return u.body ? { kind: "available", version: u.version, notes: u.body } : { kind: "available", version: u.version };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** The automatic check speaks only when there is something to install; the manual one always answers. */
export function present(outcome: CheckOutcome, trigger: Trigger): Presentation {
  if (outcome.kind === "available") {
    return { show: "banner", version: outcome.version, text: `Inkwell ${outcome.version} is available` };
  }
  if (trigger === "auto") return { show: "nothing" };
  return outcome.kind === "none"
    ? { show: "toast", text: "You're up to date" }
    : { show: "toast", text: "Couldn't check for updates — are you online?" };
}

export function progressText(downloaded: number, total?: number): string {
  if (total && total > 0) {
    const pct = Math.min(100, Math.max(0, Math.floor((downloaded / total) * 100)));
    return `Downloading… ${pct}%`;
  }
  if (downloaded <= 0) return "Downloading…";
  return `Downloading… ${(downloaded / 1024 / 1024).toFixed(1)} MB`;
}
