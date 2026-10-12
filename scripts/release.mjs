// npm run release              → signed build + release/ folder (installer, .sig, latest.json, notes.md)
// npm run release -- --publish → the same, then `gh release create` on github.com/fizzexual/inkwell.md
// npm run release -- --notes "What changed"   (one-line notes; default "Inkwell <version>")
// npm run release -- --notes-file notes.md    (multi-line notes — npm on Windows cuts --notes at a newline)
//
// The updater signing key never enters the repo: it is read from %USERPROFILE%\.tauri\ and handed
// only to the child `tauri build` process (TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLatestJson, cargoVersion, checkVersions, ghReleaseArgs, ghReleaseCommand, pickInstaller, releaseNotes } from "./latest-json.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const publish = args.includes("--publish");

function fail(msg) {
  console.error(`\nrelease: ${msg}`);
  process.exit(1);
}

// 1. one version everywhere
const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
let version;
try {
  version = checkVersions({
    conf: conf.version,
    cargo: cargoVersion(readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8")),
    pkg: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
  });
} catch (e) {
  fail(e.message);
}
const notes = releaseNotes(args, version, (p) => readFileSync(p, "utf8"));

// 2. the signing key (outside the repo)
const keyDir = join(homedir(), ".tauri");
const keyFile = join(keyDir, "inkwell-updater.key");
const pwFile = `${keyFile}.password`;
if (!existsSync(keyFile)) fail(`no signing key at ${keyFile} — create it with: npx tauri signer generate -w "${keyFile}"`);
const childEnv = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyFile, "utf8").trim() };
childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = existsSync(pwFile) ? readFileSync(pwFile, "utf8").trim() : "";

// 3. signed build (old installers of this version are removed first so a failed build can't be shipped)
const bundleDir = join(root, "src-tauri/target/release/bundle/nsis");
if (existsSync(bundleDir)) {
  for (const f of readdirSync(bundleDir)) if (f.includes(`_${version}_`)) rmSync(join(bundleDir, f));
}
console.log(`release: building Inkwell ${version} (signed)…`);
const cli = join(root, "node_modules/@tauri-apps/cli/tauri.js");
const build = spawnSync(process.execPath, [cli, "build"], { cwd: root, env: childEnv, stdio: "inherit" });
if (build.status !== 0) fail(`tauri build failed (exit ${build.status})`);

// 4. collect into release/
let picked;
try {
  picked = pickInstaller(readdirSync(bundleDir), version);
} catch (e) {
  fail(e.message);
}
const out = join(root, "release");
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
copyFileSync(join(bundleDir, picked.installer), join(out, picked.installer));
copyFileSync(join(bundleDir, picked.sig), join(out, picked.sig));
const latest = buildLatestJson({
  version,
  notes,
  pubDate: new Date(),
  signature: readFileSync(join(bundleDir, picked.sig), "utf8"),
  installerName: picked.installer,
});
writeFileSync(join(out, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
writeFileSync(join(out, "notes.md"), notes + "\n");

console.log("\nrelease: ready in release/");
for (const f of readdirSync(out)) console.log(`  ${f.padEnd(40)} ${statSync(join(out, f)).size.toLocaleString()} bytes`);

// 5. publish only on request
const cmd = ghReleaseCommand(version, picked.installer);
if (!publish) {
  console.log(`\nNot published. To publish v${version} (creates the tag and a public release):\n\n  ${cmd}\n`);
  console.log("or run: npm run release -- --publish");
  process.exit(0);
}
console.log(`\nrelease: publishing v${version}…\n  ${cmd}`);
const gh = spawnSync("gh", ghReleaseArgs(version, picked.installer), { cwd: root, stdio: "inherit" });
if (gh.status !== 0) fail(`gh release create failed (exit ${gh.status})`);
console.log(`release: published https://github.com/fizzexual/inkwell.md/releases/tag/v${version}`);
