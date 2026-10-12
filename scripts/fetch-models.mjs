// Fetch the on-device AI models into public/models/ so the app ships them and never downloads
// them at runtime. Runs before every build (and dev, with --optional). Idempotent: a file that is
// already there with the expected size is skipped; a new download is checked against the pinned
// size and hash before it is moved into place, so a half or corrupt file is never left behind.
//
// The model list (ids, pinned revisions, files, sizes, hashes) lives in src/ml/models.json, which
// the app reads too. The onnxruntime-web .wasm is NOT copied here: Vite already emits it from
// node_modules as a hashed asset (see src/ml/ml.worker.ts).
//
//   node scripts/fetch-models.mjs             # build: any failure fails the build
//   node scripts/fetch-models.mjs --optional  # dev: warn and carry on (the app then uses the hub)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = join(here, "..", "public", "models");
const MANIFEST = join(here, "..", "src", "ml", "models.json");

/** Where a model file lives on disk: <root>/<org>/<name>/<path>. */
export function localFile(root, model, file) {
  return join(root, ...model.id.split("/"), ...file.path.split("/"));
}

/** The pinned (revision, not "main") download URL of a model file. */
export function remoteUrl(model, file) {
  return `https://huggingface.co/${model.id}/resolve/${model.revision}/${file.path}`;
}

function sizeOf(path) {
  try {
    return statSync(path).size;
  } catch {
    return -1;
  }
}

/** Files that are missing or have the wrong size. */
export function planDownloads(manifest, root) {
  const plan = [];
  for (const model of Object.values(manifest)) {
    for (const file of model.files) {
      const dest = localFile(root, model, file);
      if (sizeOf(dest) !== file.size) plan.push({ model, file, dest, url: remoteUrl(model, file) });
    }
  }
  return plan;
}

/** null when the bytes match the pinned size + hash, otherwise what is wrong. */
export function verifyBytes(bytes, file) {
  if (bytes.byteLength !== file.size) return `size ${bytes.byteLength}, expected ${file.size}`;
  if (file.sha256) {
    const got = createHash("sha256").update(bytes).digest("hex");
    if (got !== file.sha256) return `sha256 ${got}, expected ${file.sha256}`;
  } else if (file.gitSha1) {
    // small (non-LFS) files are pinned by their git blob id: sha1("blob <size>\0" + content)
    const got = createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
    if (got !== file.gitSha1) return `git sha1 ${got}, expected ${file.gitSha1}`;
  }
  return null;
}

export async function fetchModels({
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8")),
  root = DEFAULT_ROOT,
  fetchFn = fetch,
  log = console.log,
} = {}) {
  const plan = planDownloads(manifest, root);
  for (const { file, dest, url } of plan) {
    log(`[models] fetching ${url} (${(file.size / 1e6).toFixed(1)} MB)`);
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`[models] ${url}: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const bad = verifyBytes(bytes, file);
    if (bad) throw new Error(`[models] ${url}: ${bad}`);
    mkdirSync(dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, dest);
  }
  return { downloaded: plan.length };
}

// run as a script (not when imported by the tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const optional = process.argv.includes("--optional");
  fetchModels().then(
    ({ downloaded }) => {
      if (downloaded) console.log(`[models] ${downloaded} file(s) fetched into ${DEFAULT_ROOT}`);
    },
    (err) => {
      if (optional) {
        console.warn(`${err.message}\n[models] continuing without bundled models — the app will load them from the hub`);
      } else {
        console.error(err.message);
        process.exit(1);
      }
    },
  );
}
