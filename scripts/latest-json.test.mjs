import { describe, expect, it } from "vitest";
import { buildLatestJson, pickInstaller, ghReleaseCommand, checkVersions, cargoVersion } from "./latest-json.mjs";

describe("latest.json (what installed apps read to find an update)", () => {
  const base = {
    version: "0.2.0",
    notes: "Inkwell 0.2.0",
    pubDate: new Date("2026-10-12T09:30:00.000Z"),
    signature: "c2lnbmF0dXJl\n",
    installerName: "Inkwell_0.2.0_x64-setup.exe",
  };

  it("has the version, notes, an RFC 3339 date and the signed windows-x86_64 installer url", () => {
    expect(buildLatestJson(base)).toEqual({
      version: "0.2.0",
      notes: "Inkwell 0.2.0",
      pub_date: "2026-10-12T09:30:00.000Z",
      platforms: {
        "windows-x86_64": {
          signature: "c2lnbmF0dXJl",
          url: "https://github.com/fizzexual/inkwell.md/releases/download/v0.2.0/Inkwell_0.2.0_x64-setup.exe",
        },
      },
    });
  });

  it("refuses to write a manifest that could not be verified or would point nowhere", () => {
    expect(() => buildLatestJson({ ...base, signature: "  " })).toThrow(/signature/);
    expect(() => buildLatestJson({ ...base, version: "v0.2" })).toThrow(/version/);
    expect(() => buildLatestJson({ ...base, installerName: "" })).toThrow(/installer/);
  });

  it("escapes an installer name with spaces in the url", () => {
    const j = buildLatestJson({ ...base, installerName: "Ink well_0.2.0_x64-setup.exe" });
    expect(j.platforms["windows-x86_64"].url).toMatch(/\/v0\.2\.0\/Ink%20well_0\.2\.0_x64-setup\.exe$/);
  });
});

describe("finding the installer the build produced", () => {
  it("picks this version's NSIS setup exe and its .sig, ignoring older builds", () => {
    const files = [
      "Inkwell_0.1.0_x64-setup.exe",
      "Inkwell_0.1.0_x64-setup.exe.sig",
      "Inkwell_0.2.0_x64-setup.exe",
      "Inkwell_0.2.0_x64-setup.exe.sig",
    ];
    expect(pickInstaller(files, "0.2.0")).toEqual({
      installer: "Inkwell_0.2.0_x64-setup.exe",
      sig: "Inkwell_0.2.0_x64-setup.exe.sig",
    });
  });

  it("fails clearly when the signature is missing (key not loaded) or there is no installer", () => {
    expect(() => pickInstaller(["Inkwell_0.2.0_x64-setup.exe"], "0.2.0")).toThrow(/\.sig/);
    expect(() => pickInstaller(["Inkwell_0.1.0_x64-setup.exe"], "0.2.0")).toThrow(/0\.2\.0/);
  });
});

describe("the publish command", () => {
  it("creates tag v<version> on the public repo with the installer, its signature and latest.json", () => {
    expect(ghReleaseCommand("0.2.0", "Inkwell_0.2.0_x64-setup.exe")).toBe(
      'gh release create v0.2.0 --repo fizzexual/inkwell.md --title "Inkwell 0.2.0" --notes-file "release/notes.md" ' +
        '"release/Inkwell_0.2.0_x64-setup.exe" "release/Inkwell_0.2.0_x64-setup.exe.sig" "release/latest.json"',
    );
  });
});

describe("version consistency", () => {
  it("passes when tauri.conf.json, Cargo.toml and package.json agree", () => {
    expect(checkVersions({ conf: "0.2.0", cargo: "0.2.0", pkg: "0.2.0" })).toBe("0.2.0");
  });

  it("refuses to release when one of them was not bumped", () => {
    expect(() => checkVersions({ conf: "0.2.0", cargo: "0.1.0", pkg: "0.2.0" })).toThrow(/Cargo\.toml 0\.1\.0/);
  });

  it("reads the package version out of Cargo.toml", () => {
    const toml = '[package]\nname = "inkwellmd"\nversion = "0.2.0"\n\n[dependencies]\ntauri = { version = "2" }\n';
    expect(cargoVersion(toml)).toBe("0.2.0");
  });
});

describe("releaseNotes", () => {
  const read = (p) => (p === "notes.md" ? "Line one\n\n- point a\n- point b\n" : "");
  it("reads multi-line notes from --notes-file (npm on Windows cuts a --notes argument at its first newline)", async () => {
    const { releaseNotes } = await import("./latest-json.mjs");
    expect(releaseNotes(["--publish", "--notes-file", "notes.md"], "0.3.0", read)).toBe("Line one\n\n- point a\n- point b");
  });
  it("falls back to --notes, then to a default", async () => {
    const { releaseNotes } = await import("./latest-json.mjs");
    expect(releaseNotes(["--notes", "Short"], "0.3.0", read)).toBe("Short");
    expect(releaseNotes([], "0.3.0", read)).toBe("Inkwell 0.3.0");
  });
});

describe("verifyNote (release page text for the unsigned installer)", () => {
  it("explains the SmartScreen warning and gives the installer's SHA-256 with the command to check it", async () => {
    const { verifyNote } = await import("./latest-json.mjs");
    const md = verifyNote("Inkwell_0.3.0_x64-setup.exe", "ab".repeat(32));
    expect(md).toContain("More info");
    expect(md).toContain("Run anyway");
    expect(md).toContain("ab".repeat(32));
    expect(md).toContain("Get-FileHash .\\Inkwell_0.3.0_x64-setup.exe");
  });
});
