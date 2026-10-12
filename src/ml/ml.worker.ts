// The on-device ML worker: the sentence-embedding model (semantic search, related notes, chat
// RAG) and Whisper (audio transcription) run here, off the main thread. Started by ./host.ts.
// Models come from the app's own /models/ (see ./runtime.ts); nothing is uploaded.
import { env, pipeline } from "@huggingface/transformers";
// the exact wasm the ORT factory bundled into this worker expects; Vite ships it as a hashed asset
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import models from "./models.json";
import { loadOnce } from "../loadOnce";
import { createDispatcher, type MlHandlers, type MlRequest, type MlTask, type OnProgress } from "./protocol";
import { ASR_OPTIONS, configureTransformers, probeLocalModels, type TransformersEnv } from "./runtime";

// transformers.js is heavy and its pipeline types are huge unions; `any` keeps them out of the build.
/* eslint-disable @typescript-eslint/no-explicit-any */

const MODEL_PATH = `${import.meta.env.BASE_URL}models/`;

/** Decide once where models come from and point ORT at the bundled wasm. */
const setup = loadOnce(async () => {
  const localModels = await probeLocalModels((u) => fetch(u), MODEL_PATH, [models.embed.id, models.asr.id]);
  configureTransformers(env as unknown as TransformersEnv, {
    localModels,
    modelPath: MODEL_PATH,
    ortWasmUrl: new URL(ortWasmUrl, self.location.href).href,
  });
});

// progress goes to whoever is waiting on the current load of that model
const progressTo: Partial<Record<MlTask, OnProgress>> = {};
const reportProgress = (task: MlTask) => (e: any) => {
  if (e?.status === "progress" && typeof e.progress === "number") progressTo[task]?.(e.progress / 100, e.file);
};

const spec = { embed: models.embed, asr: models.asr };
const loaders: Record<MlTask, () => Promise<any>> = {
  // a failed load (file missing, hub unreachable) is not cached: the next request retries
  embed: loadOnce(async () => {
    await setup();
    return pipeline("feature-extraction", spec.embed.id, {
      dtype: spec.embed.dtype as any,
      revision: spec.embed.revision,
      progress_callback: reportProgress("embed"),
    });
  }),
  asr: loadOnce(async () => {
    await setup();
    return pipeline("automatic-speech-recognition", spec.asr.id, {
      dtype: spec.asr.dtype as any,
      revision: spec.asr.revision,
      progress_callback: reportProgress("asr"),
    });
  }),
};

const handlers: MlHandlers = {
  async load(task, onProgress) {
    progressTo[task] = onProgress;
    await loaders[task]();
  },

  async embed(text) {
    const pipe = await loaders.embed();
    const out = await pipe(text, { pooling: "mean", normalize: true });
    return Float32Array.from(out.data as Float32Array); // own buffer, so it can be transferred
  },

  async transcribe(audio) {
    const pipe = await loaders.asr();
    const out = await pipe(audio, { ...ASR_OPTIONS });
    return (Array.isArray(out) ? out.map((o: any) => o.text).join(" ") : (out?.text ?? "")).trim();
  },
};

// this file only runs as a dedicated worker; the DOM lib types `self` as a Window
const scope = self as unknown as {
  postMessage(msg: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<MlRequest>) => void) | null;
};
const dispatch = createDispatcher(handlers, (msg, transfer) => scope.postMessage(msg, transfer ?? []));
scope.onmessage = (e) => void dispatch(e.data);
