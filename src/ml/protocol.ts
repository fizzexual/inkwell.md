// The message protocol between the app and the on-device ML worker (ml.worker.ts).
// Every request carries an id; the worker answers with any number of `progress` messages and then
// exactly one `result` or `error` under that id. Big Float32Arrays are transferred, not copied.

export type MlTask = "embed" | "asr";

export type MlRequest =
  | { id: number; type: "load"; task: MlTask }
  | { id: number; type: "embed"; text: string }
  | { id: number; type: "transcribe"; audio: Float32Array };

/** What each request type resolves to. */
export interface MlResults {
  load: null;
  embed: Float32Array;
  transcribe: string;
}

export type MlResponse =
  | { id: number; type: "progress"; ratio: number; file?: string }
  | { id: number; type: "result"; value: MlResults[keyof MlResults] }
  | { id: number; type: "error"; message: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type MlRequestBody = DistributiveOmit<MlRequest, "id">;

export type OnProgress = (ratio: number, file?: string) => void;

/** What the worker actually does — transformers.js in the real worker, fakes in tests. */
export interface MlHandlers {
  load(task: MlTask, onProgress: OnProgress): Promise<void>;
  embed(text: string): Promise<Float32Array>;
  transcribe(audio: Float32Array): Promise<string>;
}

type Post<M> = (msg: M, transfer?: Transferable[]) => void;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Worker side: run one request and post its progress + result/error. Never throws. */
export function createDispatcher(h: MlHandlers, post: Post<MlResponse>) {
  return async (req: MlRequest): Promise<void> => {
    const { id } = req;
    try {
      switch (req.type) {
        case "load":
          await h.load(req.task, (ratio, file) => post({ id, type: "progress", ratio, file }));
          post({ id, type: "result", value: null });
          return;
        case "embed": {
          const vec = await h.embed(req.text);
          post({ id, type: "result", value: vec }, [vec.buffer as ArrayBuffer]);
          return;
        }
        case "transcribe":
          post({ id, type: "result", value: await h.transcribe(req.audio) });
          return;
        default:
          post({ id, type: "error", message: `unknown request ${JSON.stringify((req as { type?: unknown }).type)}` });
      }
    } catch (err) {
      post({ id, type: "error", message: errorMessage(err) });
    }
  };
}

interface Pending {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
  onProgress?: OnProgress;
}

/** Main-thread side: send requests, match replies to them by id. */
export function createClient(post: Post<MlRequest>) {
  let nextId = 1;
  const pending = new Map<number, Pending>();

  return {
    request<B extends MlRequestBody>(body: B, onProgress?: OnProgress): Promise<MlResults[B["type"]]> {
      const id = nextId++;
      return new Promise<MlResults[B["type"]]>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: never) => void, reject, onProgress });
        try {
          const transfer = body.type === "transcribe" ? [body.audio.buffer as ArrayBuffer] : undefined;
          post({ ...body, id } as MlRequest, transfer);
        } catch (err) {
          pending.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },

    handle(msg: MlResponse): void {
      const p = pending.get(msg.id);
      if (!p) return; // late reply for a request we already failed
      if (msg.type === "progress") p.onProgress?.(msg.ratio, msg.file);
      else {
        pending.delete(msg.id);
        if (msg.type === "result") p.resolve(msg.value as never);
        else p.reject(new Error(msg.message));
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

export type MlClient = ReturnType<typeof createClient>;
