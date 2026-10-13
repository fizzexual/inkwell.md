import { describe, expect, it } from "vitest";
import { PROVIDERS, getProvider, visibleProviders } from "./providers";

const ids = (cli: Parameters<typeof visibleProviders>[0]) => visibleProviders(cli).map((p) => p.id);

describe("Claude Code / Codex CLI providers", () => {
  it("exist, need no key, and say whose subscription they use", () => {
    for (const id of ["claude-code", "codex-cli"]) {
      const p = getProvider(id);
      expect(p.id).toBe(id);
      expect(p.kind).toBe("cli");
      expect(p.keyless).toBe(true);
      expect(p.label).toMatch(/your subscription/);
    }
    expect(getProvider("claude-code").cli).toBe("claude");
    expect(getProvider("codex-cli").cli).toBe("codex");
  });

  it("are hidden in the browser and until the binary is found", () => {
    expect(ids(null)).not.toContain("claude-code");
    expect(ids(null)).not.toContain("codex-cli");
    expect(ids({ claude: null, codex: null })).toEqual(ids(null));
    expect(ids({ claude: "2.1.289 (Claude Code)", codex: null })).toContain("claude-code");
    expect(ids({ claude: "2.1.289 (Claude Code)", codex: null })).not.toContain("codex-cli");
    expect(ids({ claude: null, codex: "codex-cli 0.46.0" })).toContain("codex-cli");
  });

  it("never hides the API providers", () => {
    const api = PROVIDERS.filter((p) => p.kind !== "cli").map((p) => p.id);
    expect(ids(null)).toEqual(api);
  });
});
