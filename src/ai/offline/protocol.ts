// The message protocol between the app and the offline chat worker (chat.worker.ts).
// `generate` streams `token` messages and ends with one `done` (or `error`). `cancel` asks the
// worker to stop a running generation after the current token; the client stops listening at
// once, so Stop is instant even if the worker needs a moment to notice.
import type { ChatTurn } from "./prompt";

export type ChatRequest =
  | { id: number; type: "load" }
  | { id: number; type: "generate"; messages: ChatTurn[]; maxNewTokens: number }
  | { id: number; type: "cancel"; target: number };

export interface Generated {
  text: string;
  tokens: number;
}

export type ChatResponse =
  | { id: number; type: "progress"; ratio: number; file?: string }
  | { id: number; type: "loaded"; device: string }
  | { id: number; type: "token"; text: string }
  | { id: number; type: "done"; text: string; tokens: number }
  | { id: number; type: "error"; message: string };

export type OnProgress = (ratio: number, file?: string) => void;

/** What the worker does — transformers.js in the real worker, fakes in tests. */
export interface ChatHandlers {
  load(onProgress: OnProgress): Promise<{ device: string }>;
  generate(
    messages: ChatTurn[],
    maxNewTokens: number,
    onToken: (text: string) => void,
    shouldStop: () => boolean,
  ): Promise<Generated>;
}

type Post<M> = (msg: M) => void;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Worker side: run one request and post its messages. Never throws. */
export function createChatDispatcher(h: ChatHandlers, post: Post<ChatResponse>) {
  const cancelled = new Set<number>();
  return async (req: ChatRequest): Promise<void> => {
    const { id } = req;
    try {
      switch (req.type) {
        case "load": {
          const { device } = await h.load((ratio, file) => post({ id, type: "progress", ratio, file }));
          post({ id, type: "loaded", device });
          return;
        }
        case "generate": {
          const out = await h.generate(
            req.messages,
            req.maxNewTokens,
            (text) => post({ id, type: "token", text }),
            () => cancelled.has(id),
          );
          post({ id, type: "done", text: out.text, tokens: out.tokens });
          return;
        }
        case "cancel":
          cancelled.add(req.target);
          return;
        default:
          post({ id, type: "error", message: `unknown request ${JSON.stringify((req as { type?: unknown }).type)}` });
      }
    } catch (err) {
      post({ id, type: "error", message: errorMessage(err) });
    } finally {
      if (req.type === "generate") cancelled.delete(id);
    }
  };
}

export interface GenerateResult extends Generated {
  /** the user pressed Stop; `text` is what had streamed by then */
  aborted: boolean;
}

interface Pending {
  onToken?: (t: string) => void;
  onProgress?: OnProgress;
  text: string;
  resolve: (v: never) => void;
  reject: (e: Error) => void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Main-thread side. */
export function createChatClient(post: Post<ChatRequest>) {
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const send = <T>(body: DistributiveOmit<ChatRequest, "id">, p: Omit<Pending, "resolve" | "reject" | "text">) => {
    const id = nextId++;
    const promise = new Promise<T>((resolve, reject) => {
      pending.set(id, { ...p, text: "", resolve: resolve as (v: never) => void, reject });
      try {
        post({ ...body, id } as ChatRequest);
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    return { id, promise };
  };

  return {
    load(onProgress?: OnProgress): Promise<{ device: string }> {
      return send<{ device: string }>({ type: "load" }, { onProgress }).promise;
    },

    generate(
      messages: ChatTurn[],
      maxNewTokens: number,
      onToken: (text: string) => void,
      signal?: AbortSignal,
    ): Promise<GenerateResult> {
      if (signal?.aborted) return Promise.resolve({ text: "", tokens: 0, aborted: true });
      const { id, promise } = send<GenerateResult>({ type: "generate", messages, maxNewTokens }, { onToken });
      signal?.addEventListener(
        "abort",
        () => {
          const p = pending.get(id);
          if (!p) return;
          pending.delete(id); // nothing more reaches the caller from this run
          try {
            post({ id: nextId++, type: "cancel", target: id });
          } catch {
            /* worker already gone */
          }
          p.resolve({ text: p.text, tokens: 0, aborted: true } as never);
        },
        { once: true },
      );
      return promise;
    },

    handle(msg: ChatResponse): void {
      const p = pending.get(msg.id);
      if (!p) return; // a stopped or failed request
      switch (msg.type) {
        case "progress":
          p.onProgress?.(msg.ratio, msg.file);
          return;
        case "token":
          p.text += msg.text;
          p.onToken?.(msg.text);
          return;
        case "loaded":
          pending.delete(msg.id);
          p.resolve({ device: msg.device } as never);
          return;
        case "done":
          pending.delete(msg.id);
          p.resolve({ text: msg.text, tokens: msg.tokens, aborted: false } as never);
          return;
        case "error":
          pending.delete(msg.id);
          p.reject(new Error(msg.message));
      }
    },

    /** The worker is gone: fail everything still waiting on it. */
    failAll(err: Error): void {
      const all = [...pending.values()];
      pending.clear();
      for (const p of all) p.reject(err);
    },

    pending: () => pending.size,
  };
}

export type ChatClient = ReturnType<typeof createChatClient>;
