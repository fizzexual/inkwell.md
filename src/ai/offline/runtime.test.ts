import { describe, expect, it } from "vitest";
import chatModel from "../../ml/chat-model.json";
import { configureChatRuntime, MODEL_HOST, modelFileUrl, pickDevice, loadWithFallback, type ChatEnv } from "./runtime";

const freshEnv = (): ChatEnv => ({
  allowLocalModels: true,
  allowRemoteModels: false,
  remoteHost: "https://huggingface.co/",
  remotePathTemplate: "{model}/resolve/{revision}/",
  useBrowserCache: true,
  useWasmCache: true,
  backends: { onnx: {} },
});

describe("offline chat runtime", () => {
  it("loads the model only from the app's own inkmodel scheme, never the hub, and caches nothing in the browser", () => {
    const env = freshEnv();
    configureChatRuntime(env, { ortWasmUrl: "http://tauri.localhost/assets/ort.wasm" });
    expect(env.remoteHost).toBe(MODEL_HOST);
    expect(MODEL_HOST).toBe("http://inkmodel.localhost/");
    expect(env.remotePathTemplate).toBe("{model}/");
    expect(env.allowLocalModels).toBe(false);
    expect(env.useBrowserCache).toBe(false); // the files are already on disk: no second copy
    expect(env.useWasmCache).toBe(false);
    expect(env.backends.onnx.wasm).toMatchObject({ wasmPaths: { wasm: "http://tauri.localhost/assets/ort.wasm" }, numThreads: 1, proxy: false });
  });

  it("asks for exactly the URL paths the Rust handler serves: /<org>/<name>/<pinned file>", () => {
    for (const f of chatModel.files) {
      const url = new URL(modelFileUrl(chatModel.id, f.path));
      expect(url.origin).toBe("http://inkmodel.localhost");
      expect(url.pathname).toBe(`/${chatModel.id}/${f.path}`);
    }
  });

  it("uses WebGPU when the webview has an adapter, otherwise the CPU (wasm)", async () => {
    expect(await pickDevice(undefined)).toBe("wasm");
    expect(await pickDevice({ requestAdapter: async () => null })).toBe("wasm");
    expect(await pickDevice({ requestAdapter: async () => { throw new Error("blocked"); } })).toBe("wasm");
    expect(await pickDevice({ requestAdapter: async () => ({}) })).toBe("webgpu");
  });

  it("falls back to the CPU when the GPU load fails, and reports which one is running", async () => {
    const tried: string[] = [];
    const got = await loadWithFallback("webgpu", async (d) => {
      tried.push(d);
      if (d === "webgpu") throw new Error("no shader-f16");
      return `model on ${d}`;
    });
    expect(tried).toEqual(["webgpu", "wasm"]);
    expect(got).toEqual({ device: "wasm", value: "model on wasm" });
  });

  it("a CPU load failure is reported, not retried forever", async () => {
    await expect(loadWithFallback("wasm", async () => { throw new Error("out of memory"); })).rejects.toThrow("out of memory");
  });
});
