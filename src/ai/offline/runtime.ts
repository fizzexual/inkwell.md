// Where the offline chat worker gets its model and which device runs it.
//
// The model files live in <app_data_dir>/models/, downloaded by the desktop app (Rust, see
// src-tauri/src/offline_model.rs) and served back through the app's own `inkmodel` URI scheme. So
// transformers.js is pointed at that scheme as its "hub": it never contacts Hugging Face, and the
// webview's CSP only needs the one `http://inkmodel.localhost` origin.

/** The parts of transformers.js' `env` the chat worker sets. */
export interface ChatEnv {
  allowLocalModels: boolean;
  allowRemoteModels: boolean;
  remoteHost: string;
  remotePathTemplate: string;
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

/** Tauri serves a custom scheme `x` at `http://x.localhost/` on Windows (the only desktop target). */
export const MODEL_HOST = "http://inkmodel.localhost/";

export type Device = "webgpu" | "wasm";

export function configureChatRuntime(env: ChatEnv, c: { ortWasmUrl: string }): void {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = MODEL_HOST;
  env.remotePathTemplate = "{model}/"; // no /resolve/<revision>/: the folder holds the pinned revision
  // the files are already on disk; caching them in the webview would store the model twice
  env.useBrowserCache = false;
  // same ORT setup as the ML worker (src/ml/runtime.ts): only the bundled .wasm, one thread
  env.useWasmCache = false;
  const wasm = (env.backends.onnx.wasm ??= {});
  wasm.wasmPaths = { wasm: c.ortWasmUrl };
  wasm.numThreads = 1;
  wasm.proxy = false;
}

/** The URL transformers.js will request for a model file (what the Rust handler must serve). */
export const modelFileUrl = (id: string, path: string) => `${MODEL_HOST}${id}/${path}`;

/** WebGPU when the webview exposes a GPU adapter, else the CPU (wasm). */
export async function pickDevice(gpu: { requestAdapter(): Promise<unknown> } | undefined): Promise<Device> {
  if (!gpu) return "wasm";
  try {
    return (await gpu.requestAdapter()) ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

/** Load on `first`; if the GPU load fails (driver, missing feature), load again on the CPU. */
export async function loadWithFallback<T>(
  first: Device,
  load: (d: Device) => Promise<T>,
): Promise<{ device: Device; value: T }> {
  try {
    return { device: first, value: await load(first) };
  } catch (err) {
    if (first === "wasm") throw err;
    console.warn("Inkwell: offline model failed on WebGPU, falling back to the CPU", err);
    return { device: "wasm", value: await load("wasm") };
  }
}
