import { describe, expect, it } from "vitest";
import conf from "../../src-tauri/tauri.conf.json";
import caps from "../../src-tauri/capabilities/default.json";

// The installer + updater live in config, so pin it: a wrong value here ships a broken updater.
type Conf = {
  productName: string;
  bundle: {
    targets: string[];
    publisher?: string;
    createUpdaterArtifacts?: boolean;
    windows?: { nsis?: { installMode?: string; startMenuFolder?: string } };
  };
  plugins?: { updater?: { pubkey?: string; endpoints?: string[]; windows?: { installMode?: string } } };
};
const c = conf as unknown as Conf;

describe("installer config", () => {
  it("builds a per-user NSIS installer named Inkwell, published by fizzexual, with updater artifacts", () => {
    expect(c.productName).toBe("Inkwell");
    expect(c.bundle.targets).toEqual(["nsis"]);
    expect(c.bundle.publisher).toBe("fizzexual");
    expect(c.bundle.createUpdaterArtifacts).toBe(true);
    expect(c.bundle.windows?.nsis?.installMode).toBe("currentUser");
  });
});

describe("updater config", () => {
  it("checks GitHub's latest release over https, with a minisign public key, installing passively", () => {
    const u = c.plugins?.updater;
    expect(u?.endpoints).toEqual([
      "https://github.com/fizzexual/inkwell.md/releases/latest/download/latest.json",
    ]);
    // the public key is base64 of a minisign "untrusted comment: minisign public key …" file
    const decoded = atob(u?.pubkey ?? "");
    expect(decoded).toMatch(/^untrusted comment: minisign public key/);
    expect(decoded).not.toMatch(/secret/i);
    expect(u?.windows?.installMode).toBe("passive");
  });

  it("the window may only check/install updates and restart — nothing broader", () => {
    const perms = caps.permissions as string[];
    expect(perms).toContain("updater:default");
    expect(perms).toContain("process:allow-restart");
    expect(perms.filter((p) => p.startsWith("process:"))).toEqual(["process:allow-restart"]);
  });
});
