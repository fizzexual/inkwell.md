// The app's handle on the offline chat worker. A dedicated worker, not the ML worker: generation
// runs for many seconds and (on the CPU fallback) blocks its thread, which would stall the
// embeddings that semantic search, related notes and this chat's own retrieval need meanwhile.
import { createChatClient, type ChatClient, type ChatRequest, type ChatResponse, type GenerateResult, type OnProgress } from "./protocol";
import type { ChatTurn } from "./prompt";

export interface ChatWorkerLike {
  postMessage(msg: ChatRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<ChatResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

/** After Stop, a worker that hasn't wound down within this long is stuck in a CPU-bound run. */
const STOP_GRACE_MS = 2000;

export function createChatHost(makeWorker: () => ChatWorkerLike, graceMs = STOP_GRACE_MS) {
  let current: { worker: ChatWorkerLike; client: ChatClient } | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;

  const kill = (why: string) => {
    if (!current) return;
    const { worker, client } = current;
    current = null;
    worker.terminate();
    client.failAll(new Error(why));
  };

  const client = (): ChatClient => {
    if (current) return current.client;
    const worker = makeWorker();
    const c = createChatClient((msg) => worker.postMessage(msg));
    const me = { worker, client: c };
    worker.onmessage = (e) => {
      if (e.data.type === "done" || e.data.type === "error") clearTimeout(stopTimer);
      c.handle(e.data);
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      if (current === me) kill(e.message || "the offline model worker stopped");
    };
    current = me;
    return c;
  };

  const call = <T>(f: (c: ChatClient) => Promise<T>): Promise<T> => {
    try {
      return f(client());
    } catch (err) {
      return Promise.reject(err);
    }
  };

  return {
    load: (onProgress?: OnProgress) => call((c) => c.load(onProgress)),
    generate(messages: ChatTurn[], maxNewTokens: number, onToken: (t: string) => void, signal?: AbortSignal): Promise<GenerateResult> {
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(stopTimer);
          // the worker frees itself after the current token; if it can't (busy CPU), restart it
          stopTimer = setTimeout(() => kill("stopped"), graceMs);
        },
        { once: true },
      );
      return call((c) => c.generate(messages, maxNewTokens, onToken, signal));
    },
  };
}

export type ChatHost = ReturnType<typeof createChatHost>;

/** The app-wide offline chat worker (started on first use). */
export const offlineChat: ChatHost = createChatHost(
  () => new Worker(new URL("./chat.worker.ts", import.meta.url), { type: "module", name: "inkwell-chat" }),
);
