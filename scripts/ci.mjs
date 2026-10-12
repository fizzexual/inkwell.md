// Local CI: the same checks a hosted CI would run, on this machine. `npm run ci`
// Stops at the first failing step (exit 1) and prints a short table of what ran.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauri = join(root, "src-tauri");
// run the project's own tools through node, so no shell and no global installs are involved
const bin = (rel) => join(root, "node_modules", rel);
const node = process.execPath;

export const STEPS = [
  { name: "tsc", cmd: node, args: [bin("typescript/bin/tsc"), "--noEmit", "-p", "."], cwd: root },
  { name: "vitest", cmd: node, args: [bin("vitest/vitest.mjs"), "run"], cwd: root },
  { name: "vite build", cmd: node, args: [bin("vite/bin/vite.js"), "build"], cwd: root },
  { name: "cargo test", cmd: "cargo", args: ["test"], cwd: tauri },
  { name: "cargo clippy", cmd: "cargo", args: ["clippy", "--all-targets", "--", "-D", "warnings"], cwd: tauri },
];

/**
 * Run `steps` in order with `exec` (returns the exit code, or null if it couldn't start).
 * Stops at the first failure; later steps are reported as skipped.
 */
export function runCi(steps, exec, now = Date.now) {
  const results = [];
  let ok = true;
  for (const step of steps) {
    if (!ok) {
      results.push({ name: step.name, status: "skip", seconds: 0 });
      continue;
    }
    const start = now();
    const code = exec(step);
    const seconds = (now() - start) / 1000;
    ok = code === 0;
    results.push({ name: step.name, status: ok ? "ok" : "fail", seconds });
  }
  return { ok, results };
}

/** A plain-text table: step, result, seconds. */
export function summary(results) {
  const w = Math.max(4, ...results.map((r) => r.name.length));
  const row = (a, b, c) => `${a.padEnd(w)}  ${b.padEnd(6)}  ${c}`;
  return [
    row("step", "result", "seconds"),
    ...results.map((r) =>
      row(r.name, r.status === "fail" ? "FAIL" : r.status, r.status === "skip" ? "-" : r.seconds.toFixed(1)),
    ),
  ].join("\n");
}

function exec(step) {
  console.log(`\n▶ ${step.name}`);
  const r = spawnSync(step.cmd, step.args, { cwd: step.cwd, stdio: "inherit" });
  if (r.error) console.error(`  couldn't start ${step.cmd}: ${r.error.message}`);
  return r.error ? null : r.status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, results } = runCi(STEPS, exec);
  console.log(`\n${summary(results)}\n\nCI ${ok ? "passed" : "FAILED"}`);
  process.exit(ok ? 0 : 1);
}
