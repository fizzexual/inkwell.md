import { describe, it, expect } from "vitest";
import conf from "../src-tauri/tauri.conf.json";

const csp = conf.app.security.csp as Record<string, string>;
const sources = (directive: string) => csp[directive].split(/\s+/);

describe("Content-Security-Policy", () => {
  it("runs only the app's own scripts (+ WebAssembly): no CDN, no blob: scripts", () => {
    expect(sources("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it("does not open the network for on-device AI (models + ONNX runtime ship with the app)", () => {
    const connect = csp["connect-src"];
    expect(connect).not.toContain("cdn.jsdelivr.net");
    expect(connect).not.toContain("huggingface.co");
    expect(connect).not.toContain("hf.co");
  });

  it("keeps the hosts the other features need", () => {
    const connect = sources("connect-src");
    for (const host of ["'self'", "ipc:", "http://ipc.localhost", "https://r.jina.ai", "https://api.crossref.org"]) {
      expect(connect).toContain(host);
    }
  });
});
