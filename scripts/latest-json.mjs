// Pure helpers for scripts/release.mjs (unit-tested in latest-json.test.mjs).

export const REPO = "fizzexual/inkwell.md";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * The manifest installed apps fetch from
 * https://github.com/<REPO>/releases/latest/download/latest.json
 */
export function buildLatestJson({ version, notes, pubDate, signature, installerName }) {
  if (!SEMVER.test(version ?? "")) throw new Error(`bad version "${version}" (want X.Y.Z)`);
  const sig = (signature ?? "").trim();
  if (!sig) throw new Error("empty signature — was the build signed? (TAURI_SIGNING_PRIVATE_KEY)");
  if (!installerName) throw new Error("no installer name");
  return {
    version,
    notes: notes ?? "",
    pub_date: (pubDate ?? new Date()).toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: sig,
        url: `https://github.com/${REPO}/releases/download/v${version}/${encodeURIComponent(installerName)}`,
      },
    },
  };
}

/** From the NSIS bundle folder listing, this version's setup exe and its .sig. */
export function pickInstaller(files, version) {
  const installer = files.find((f) => f.endsWith(".exe") && f.includes(`_${version}_`) && /-setup\.exe$/.test(f));
  if (!installer) throw new Error(`no NSIS installer for ${version} in: ${files.join(", ") || "(empty)"}`);
  const sig = `${installer}.sig`;
  if (!files.includes(sig)) throw new Error(`missing ${sig} — the build was not signed`);
  return { installer, sig };
}

/** gh arguments that publish the release (run only with --publish). Paths are relative to the repo root. */
export function ghReleaseArgs(version, installer) {
  return [
    "release", "create", `v${version}`,
    "--repo", REPO,
    "--title", `Inkwell ${version}`,
    "--notes-file", "release/notes.md",
    `release/${installer}`, `release/${installer}.sig`, "release/latest.json",
  ];
}

/** The same command, printable and copy-pasteable. */
export function ghReleaseCommand(version, installer) {
  const q = (a) => (/[\s"]|^release\//.test(a) ?`"${a}"` : a);
  return ["gh", ...ghReleaseArgs(version, installer)].map(q).join(" ");
}

/** The package version from Cargo.toml's [package] table. */
export function cargoVersion(toml) {
  const pkg = toml.split(/^\[/m).find((t) => t.startsWith("package]")) ?? "";
  const m = pkg.match(/^version\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error("no [package] version in Cargo.toml");
  return m[1];
}

/** All three version fields must agree, or the installed app would keep offering the "update". */
export function checkVersions({ conf, cargo, pkg }) {
  if (conf !== cargo || conf !== pkg) {
    throw new Error(
      `versions disagree: tauri.conf.json ${conf}, Cargo.toml ${cargo}, package.json ${pkg} — bump all three`,
    );
  }
  return conf;
}
