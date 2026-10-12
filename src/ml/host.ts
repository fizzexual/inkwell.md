// The app's handle on the on-device ML worker: embeddings and Whisper run off the main thread so
// typing, scrolling and the graph stay smooth while a model loads or a vault is being indexed.
import { createClient, type MlClient, type MlRequest, type MlResponse, type MlTask, type OnProgress } from "./protocol";

/** The bits of `Worker` we use (so tests can pass a fake). */
export interface WorkerLike {
  postMessage(msg: MlRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<MlResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export function createMlHost(makeWorker: () => WorkerLike) {
  let current: { worker: WorkerLike; client: MlClient } | null = null;

  // the worker starts on first use; if it dies, everything waiting on it fails and the next
  // request starts a fresh one (same retry-after-failure rule as loadOnce)
  const client = (): MlClient => {
    if (current) return current.client;
    const worker = makeWorker();
    const c = createClient((msg, transfer) => worker.postMessage(msg, transfer ?? []));
    const me = { worker, client: c };
    worker.onmessage = (e) => c.handle(e.data);
    worker.onerror = (e) => {
      e.preventDefault?.();
      if (current === me) current = null;
      worker.terminate();
      c.failAll(new Error(e.message || "the on-device AI worker stopped"));
    };
    current = me;
    return c;
  };

  // creating the worker can throw (no Worker support); surface that as a rejected request
  const call = <T>(f: (c: MlClient) => Promise<T>): Promise<T> => {
    try {
      return f(client());
    } catch (err) {
      return Promise.reject(err);
    }
  };

  return {
    load: (task: MlTask, onProgress?: OnProgress) => call((c) => c.request({ type: "load", task }, onProgress)),
    embed: (text: string) => call((c) => c.request({ type: "embed", text })),
    transcribe: (audio: Float32Array) => call((c) => c.request({ type: "transcribe", audio })),
  };
}

export type MlHost = ReturnType<typeof createMlHost>;

/** The app-wide worker. */
export const ml: MlHost = createMlHost(
  () => new Worker(new URL("./ml.worker.ts", import.meta.url), { type: "module", name: "inkwell-ml" }),
);
