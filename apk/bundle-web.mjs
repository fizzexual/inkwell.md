#!/usr/bin/env node
// Copies the built web app (../dist) into the Android app's assets/ so the APK is LOCAL-FIRST:
// the whole Inkwell app ships inside the .apk and runs offline, syncing to your server in the
// background. Run this after `npm run build`, before `gradlew assembleDebug`.
//
//   npm run build          # from the repo root -> produces dist/
//   node apk/bundle-web.mjs # copies dist -> apk/app/src/main/assets (pruning the heavy ML runtime)
//   cd apk && gradlew assembleDebug
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "..", "dist");
const ASSETS = path.resolve(here, "app", "src", "main", "assets");

// the ~22MB semantic-search ML runtime is online-only — leave it out to keep the APK small
const PRUNE = /(transformers|ort-|\.wasm$)/i;

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (!PRUNE.test(e.name) && e.name !== "inkwell.apk") await fs.copyFile(s, d);
  }
}

async function main() {
  try {
    await fs.access(path.join(DIST, "index.html"));
  } catch {
    console.error("No dist/index.html — run `npm run build` first.");
    process.exit(1);
  }
  await fs.rm(ASSETS, { recursive: true, force: true });
  await copyDir(DIST, ASSETS);
  console.log(`Bundled the web app into ${path.relative(here, ASSETS)} (ML runtime pruned).`);
}

main();
