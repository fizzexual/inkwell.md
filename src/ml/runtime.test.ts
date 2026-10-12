import { describe, it, expect } from "vitest";
import { probeLocalModels, configureTransformers, type TransformersEnv } from "./runtime";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
// Tauri (and Vite) answer an unknown path with index.html and a 200 — that is NOT a model file
const indexHtml = () => new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html" } });

describe("probeLocalModels", () => {
  it("is true when every model's config.json is served as JSON", async () => {
    const asked: string[] = [];
    const ok = await probeLocalModels(async (url) => {
      asked.push(String(url));
      return json({ model_type: "bert" });
    }, "/models/", ["Org/a", "Org/b"]);
    expect(ok).toBe(true);
    expect(asked).toEqual(["/models/Org/a/config.json", "/models/Org/b/config.json"]);
  });

  it("is false when a missing file comes back as the app's index.html with a 200", async () => {
    expect(await probeLocalModels(async () => indexHtml(), "/models/", ["Org/a"])).toBe(false);
  });

  it("is false when any one model is missing (404) or the fetch fails", async () => {
    let n = 0;
    const one404 = async () => (n++ === 0 ? json({}) : new Response("", { status: 404 }));
    expect(await probeLocalModels(one404, "/models/", ["Org/a", "Org/b"])).toBe(false);
    const offline = async (): Promise<Response> => {
      throw new TypeError("Failed to fetch");
    };
    expect(await probeLocalModels(offline, "/models/", ["Org/a"])).toBe(false);
  });
});

function freshEnv(): TransformersEnv {
  // what transformers.js sets up in a browser: hub only, ORT from jsDelivr
  return {
    allowLocalModels: false,
    allowRemoteModels: true,
    localModelPath: "/models/",
    useBrowserCache: true,
    useWasmCache: true,
    backends: {
      onnx: {
        wasm: {
          wasmPaths: {
            mjs: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1/dist/ort-wasm-simd-threaded.asyncify.mjs",
            wasm: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1/dist/ort-wasm-simd-threaded.asyncify.wasm",
          },
          proxy: false,
        },
      },
    },
  };
}

describe("configureTransformers", () => {
  it("bundled models: local only, no hub, no extra browser-cache copy", () => {
    const env = freshEnv();
    configureTransformers(env, { localModels: true, modelPath: "/models/", ortWasmUrl: "/assets/ort.wasm" });
    expect(env.allowLocalModels).toBe(true);
    expect(env.allowRemoteModels).toBe(false);
    expect(env.localModelPath).toBe("/models/");
    expect(env.useBrowserCache).toBe(false);
  });

  it("no bundled models (dev checkout without the fetch script): hub fallback, browser-cached", () => {
    const env = freshEnv();
    configureTransformers(env, { localModels: false, modelPath: "/models/", ortWasmUrl: "/assets/ort.wasm" });
    expect(env.allowLocalModels).toBe(false);
    expect(env.allowRemoteModels).toBe(true);
    expect(env.useBrowserCache).toBe(true);
  });

  it("always runs ORT from the app's own wasm: no CDN, no blob: factory, single thread", () => {
    for (const localModels of [true, false]) {
      const env = freshEnv();
      configureTransformers(env, { localModels, modelPath: "/models/", ortWasmUrl: "/assets/ort.wasm" });
      const wasm = env.backends.onnx.wasm!;
      // only the .wasm is overridden: ORT then uses the factory bundled into the worker, which
      // means no dynamic import of an .mjs and no blob: URL (transformers only makes one when
      // both mjs and wasm paths are set)
      expect(wasm.wasmPaths).toEqual({ wasm: "/assets/ort.wasm" });
      expect(env.useWasmCache).toBe(false);
      expect(wasm.numThreads).toBe(1);
      expect(wasm.proxy).toBe(false);
      expect(JSON.stringify(env)).not.toContain("jsdelivr");
    }
  });
});

describe("Whisper decoding options", () => {
  it("asks for timestamps, or whisper-tiny stops after the first sentence", async () => {
    // measured on a 6.4 s two-sentence clip with the bundled q8 model: without timestamps only
    // "The quick brown fox jumps over the lazy dog." came back; with them both sentences did
    const { ASR_OPTIONS } = await import("./runtime");
    expect(ASR_OPTIONS).toMatchObject({ chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
  });
});
