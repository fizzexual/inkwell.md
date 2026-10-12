import { describe, expect, it } from "vitest";
import { STEPS, runCi, summary } from "./ci.mjs";

const steps = [
  { name: "a", cmd: "x", args: [] },
  { name: "b", cmd: "x", args: [] },
  { name: "c", cmd: "x", args: [] },
];
// a fake clock: every step takes 1.5 s
const clock = () => {
  let t = 0;
  return () => (t += 1500);
};

describe("local CI runner", () => {
  it("runs every step in order and passes when all pass", () => {
    const ran = [];
    const r = runCi(steps, (s) => (ran.push(s.name), 0), clock());
    expect(ran).toEqual(["a", "b", "c"]);
    expect(r.ok).toBe(true);
    expect(r.results.map((x) => x.status)).toEqual(["ok", "ok", "ok"]);
    expect(r.results[0].seconds).toBe(1.5);
  });

  it("stops at the first failure and skips the rest", () => {
    const ran = [];
    const r = runCi(steps, (s) => (ran.push(s.name), s.name === "b" ? 2 : 0), clock());
    expect(ran).toEqual(["a", "b"]);
    expect(r.ok).toBe(false);
    expect(r.results.map((x) => x.status)).toEqual(["ok", "fail", "skip"]);
  });

  it("treats a step that could not start as a failure", () => {
    const r = runCi(steps.slice(0, 1), () => null, clock());
    expect(r.ok).toBe(false);
    expect(r.results[0].status).toBe("fail");
  });

  it("prints one row per step with status and seconds", () => {
    const text = summary([
      { name: "tsc", status: "ok", seconds: 3.24 },
      { name: "cargo test", status: "fail", seconds: 61 },
      { name: "clippy", status: "skip", seconds: 0 },
    ]);
    const rows = text.split("\n");
    expect(rows[0]).toMatch(/step\s+result\s+seconds/);
    expect(rows.find((l) => l.startsWith("tsc"))).toMatch(/ok\s+3\.2$/);
    expect(rows.find((l) => l.startsWith("cargo test"))).toMatch(/FAIL\s+61\.0$/);
    expect(rows.find((l) => l.startsWith("clippy"))).toMatch(/skip\s+-$/);
  });

  it("checks types, tests, builds, then the Rust side with clippy last", () => {
    expect(STEPS.map((s) => s.name)).toEqual(["tsc", "vitest", "vite build", "cargo test", "cargo clippy"]);
    const clippy = STEPS.at(-1);
    expect(clippy.args).toEqual(["clippy", "--all-targets", "--", "-D", "warnings"]);
    expect(clippy.cwd).toMatch(/src-tauri$/);
  });
});
