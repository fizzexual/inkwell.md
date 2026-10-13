import { describe, expect, it } from "vitest";
import { createChatClient, createChatDispatcher, type ChatHandlers, type ChatRequest, type ChatResponse } from "./protocol";

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A generator that emits `words` one per tick and honours shouldStop between tokens. */
function fakeHandlers(words: string[], opts: { failAt?: number } = {}) {
  const seen = { loads: 0, stoppedAfter: -1 };
  const h: ChatHandlers = {
    async load(onProgress) {
      seen.loads++;
      onProgress(0.5, "onnx/model.onnx");
      onProgress(1, "onnx/model.onnx");
      return { device: "webgpu" };
    },
    async generate(_messages, _max, onToken, shouldStop) {
      let text = "";
      for (let i = 0; i < words.length; i++) {
        if (shouldStop()) {
          seen.stoppedAfter = i;
          break;
        }
        if (opts.failAt === i) throw new Error("GPU device lost");
        text += words[i];
        onToken(words[i]);
        await tick();
      }
      return { text, tokens: text.length };
    },
  };
  return { h, seen };
}

/** Client and worker wired together through async "postMessage". */
function wire(h: ChatHandlers) {
  const toWorker: ChatRequest[] = [];
  let client!: ReturnType<typeof createChatClient>;
  const dispatch = createChatDispatcher(h, (msg: ChatResponse) => queueMicrotask(() => client.handle(msg)));
  client = createChatClient((msg) => {
    toWorker.push(msg);
    queueMicrotask(() => void dispatch(msg));
  });
  return { client, toWorker };
}

describe("offline chat worker protocol", () => {
  it("streams every token in order and resolves with the full text", async () => {
    const { h } = fakeHandlers(["Hel", "lo", " world"]);
    const { client } = wire(h);
    const got: string[] = [];
    const out = await client.generate([{ role: "user", content: "hi" }], 64, (t) => got.push(t));
    expect(got).toEqual(["Hel", "lo", " world"]);
    expect(out.text).toBe("Hello world");
  });

  it("load reports progress and the device it picked", async () => {
    const { h } = fakeHandlers([]);
    const { client } = wire(h);
    const ratios: number[] = [];
    expect(await client.load((r) => ratios.push(r))).toEqual({ device: "webgpu" });
    expect(ratios).toEqual([0.5, 1]);
  });

  it("Stop: the worker is told to stop, no token arrives after it, and the partial answer is kept", async () => {
    const { h, seen } = fakeHandlers(["a", "b", "c", "d", "e", "f", "g", "h"]);
    const { client, toWorker } = wire(h);
    const ctrl = new AbortController();
    const got: string[] = [];
    const run = client.generate([{ role: "user", content: "hi" }], 64, (t) => {
      got.push(t);
      if (got.length === 2) ctrl.abort();
    }, ctrl.signal);
    const out = await run;
    expect(out.text).toBe("ab");
    expect(out.aborted).toBe(true);
    for (let i = 0; i < 20; i++) await tick();
    expect(got).toEqual(["a", "b"]); // late tokens from the worker are dropped
    expect(toWorker.some((m) => m.type === "cancel")).toBe(true);
    expect(seen.stoppedAfter).toBeGreaterThan(0); // the generator itself stopped early
    expect(seen.stoppedAfter).toBeLessThan(8);
    expect(client.pending()).toBe(0);
  });

  it("an already-aborted signal never starts a generation", async () => {
    const { h } = fakeHandlers(["a"]);
    const { client, toWorker } = wire(h);
    const ctrl = new AbortController();
    ctrl.abort();
    const out = await client.generate([{ role: "user", content: "x" }], 8, () => {}, ctrl.signal);
    expect(out).toEqual({ text: "", tokens: 0, aborted: true });
    expect(toWorker.filter((m) => m.type === "generate")).toHaveLength(0);
  });

  it("a generator error rejects that request with the worker's message", async () => {
    const { h } = fakeHandlers(["a", "b", "c"], { failAt: 1 });
    const { client } = wire(h);
    await expect(client.generate([{ role: "user", content: "x" }], 8, () => {})).rejects.toThrow("GPU device lost");
    expect(client.pending()).toBe(0);
  });

  it("a dead worker fails everything still waiting", async () => {
    const posted: ChatRequest[] = [];
    const client = createChatClient((m) => posted.push(m));
    const p = client.generate([{ role: "user", content: "x" }], 8, () => {});
    client.failAll(new Error("the offline model worker stopped"));
    await expect(p).rejects.toThrow("worker stopped");
  });

  it("the dispatcher never throws and answers unknown requests with an error", async () => {
    const { h } = fakeHandlers([]);
    const out: ChatResponse[] = [];
    const dispatch = createChatDispatcher(h, (m) => out.push(m));
    await dispatch({ id: 9, type: "bogus" } as unknown as ChatRequest);
    expect(out).toEqual([{ id: 9, type: "error", message: 'unknown request "bogus"' }]);
  });
});
