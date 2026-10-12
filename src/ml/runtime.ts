// Where the on-device models and the ONNX runtime come from.
//
// `npm run build` (and `npm run dev`) run scripts/fetch-models.mjs, which puts the pinned model
// files in public/models/, so the app serves them itself and never downloads a model. Only a
// checkout where that script never ran (or failed in dev) has no local copy; then the worker falls
// back to the Hugging Face hub at the same pinned revision. The ORT .wasm always comes from the
// app: Vite emits it from node_modules as a hashed asset.

/** The parts of transformers.js' `env` we set. */
export interface TransformersEnv {
  allowLocalModels: boolean;
  allowRemoteModels: boolean;
  localModelPath: string;
  useBrowserCache: boolean;
  useWasmCache: boolean;
  backends: {
    onnx: {
      wasm?: {
        wasmPaths?: string | { mjs?: string | URL; wasm?: string | URL };
        numThreads?: number;
        proxy?: boolean;
      };
    };
  };
}

/**
 * True when every model's config.json is served by the app as JSON. A missing file does not
 * always 404: Tauri (and Vite's SPA fallback) answer unknown paths with index.html and a 200,
 * so "it parses as a JSON object" is the test.
 */
export async function probeLocalModels(
  fetchFn: (url: string) => Promise<Response>,
  modelPath: string,
  ids: string[],
): Promise<boolean> {
  try {
    for (const id of ids) {
      const res = await fetchFn(`${modelPath}${id}/config.json`);
      if (!res.ok) return false;
      const body: unknown = JSON.parse(await res.text());
      if (!body || typeof body !== "object") return false;
    }
    return true;
  } catch {
    return false;
  }
}

export interface RuntimeChoice {
  /** Serve models from `modelPath` (bundled) instead of the hub. */
  localModels: boolean;
  /** Path (not a URL — transformers treats URLs as remote) the bundled models are served under. */
  modelPath: string;
  /** URL of the onnxruntime-web .wasm the app ships. */
  ortWasmUrl: string;
}

export function configureTransformers(env: TransformersEnv, c: RuntimeChoice): void {
  env.localModelPath = c.modelPath;
  env.allowLocalModels = c.localModels;
  // bundled: never touch the network. Hub fallback: keep the downloads in the browser cache.
  env.allowRemoteModels = !c.localModels;
  env.useBrowserCache = !c.localModels;

  // Only the .wasm path is overridden, so ORT uses the JS factory bundled into the worker:
  // no dynamic import of an .mjs from a CDN and no blob: script. transformers only builds a
  // blob: factory when BOTH paths are set; useWasmCache=false makes that explicit.
  env.useWasmCache = false;
  const wasm = (env.backends.onnx.wasm ??= {});
  wasm.wasmPaths = { wasm: c.ortWasmUrl };
  // no SharedArrayBuffer in the webview (not cross-origin isolated) -> threads would be refused
  // anyway; one thread also means ORT never spawns its own workers
  wasm.numThreads = 1;
  wasm.proxy = false; // we already are the worker
}

/** Whisper call options. Timestamps on: without them whisper-tiny.en stops decoding after the
 *  first sentence of a clip; the returned text is the same plain text either way. */
export const ASR_OPTIONS = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true } as const;
