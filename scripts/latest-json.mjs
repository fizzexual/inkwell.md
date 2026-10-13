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

/** Release notes: `--notes-file <path>` (multi-line; npm on Windows cuts a `--notes` argument at its
 *  first newline), else `--notes "<text>"`, else "Inkwell <version>". */
export function releaseNotes(args, version, readFile) {
  const fileAt = args.indexOf("--notes-file");
  if (fileAt >= 0 && args[fileAt + 1]) return readFile(args[fileAt + 1]).trim();
  const at = args.indexOf("--notes");
  return at >= 0 && args[at + 1] ? args[at + 1] : `Inkwell ${version}`;
}

/** Release-page text for the installer: why Windows warns (it isn't Authenticode-signed — an open-source
 *  choice) and how to check the download against its SHA-256. */
export function verifyNote(installerName, sha256) {
  return [
    "## Windows may warn you",
    "The installer isn't code-signed with a paid certificate, so Windows SmartScreen may show " +
      "\"Windows protected your PC\". Click **More info → Run anyway**. Updates are still signed: the app " +
      "only installs updates that carry Inkwell's own signature.",
    "",
    "To check the download is genuine, compare its SHA-256 in PowerShell:",
    "```powershell",
    `Get-FileHash .\\${installerName}`,
    "```",
    `Expected: \`${sha256}\``,
  ].join("\n");
}
