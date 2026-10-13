// The offline chat worker: runs the downloaded chat model (src/ml/chat-model.json) with
// transformers.js, on WebGPU when the webview has a GPU and on the CPU (wasm) otherwise.
// Started by ./host.ts. The model is read from disk through the app's `inkmodel` scheme
// (see ./runtime.ts); this worker makes no other network requests.
import * as transformers from "@huggingface/transformers";
// the exact wasm the ORT factory bundled into this worker expects; Vite ships it as a hashed asset
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import chatModel from "../../ml/chat-model.json";
import { createGenerator, type Transformers } from "./generate";
import { createChatDispatcher, type ChatRequest } from "./protocol";
import { configureChatRuntime, pickDevice, type ChatEnv } from "./runtime";

configureChatRuntime(transformers.env as unknown as ChatEnv, {
  ortWasmUrl: new URL(ortWasmUrl, self.location.href).href,
});

const gpu = (self.navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
const handlers = createGenerator(transformers as unknown as Transformers, chatModel, () => pickDevice(gpu));

// this file only runs as a dedicated worker; the DOM lib types `self` as a Window
const scope = self as unknown as {
  postMessage(msg: unknown): void;
  onmessage: ((e: MessageEvent<ChatRequest>) => void) | null;
};
const dispatch = createChatDispatcher(handlers, (msg) => scope.postMessage(msg));
scope.onmessage = (e) => void dispatch(e.data);
