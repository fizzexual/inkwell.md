import { describe, it, expect, vi } from "vitest";
import { createDispatcher, createClient, type MlHandlers, type MlRequest, type MlResponse } from "./protocol";

function handlers(over: Partial<MlHandlers> = {}): MlHandlers {
  return {
    load: async () => {},
    embed: async () => new Float32Array([1, 2, 3]),
    transcribe: async () => "hello",
    ...over,
  };
}

/** Run one request through a dispatcher and collect everything it posts back. */
async function run(h: MlHandlers, req: MlRequest) {
  const posted: { msg: MlResponse; transfer?: Transferable[] }[] = [];
  await createDispatcher(h, (msg, transfer) => posted.push({ msg, transfer }))(req);
  return posted;
}

describe("worker dispatcher", () => {
  it("answers a load with its progress, then a result, all under the request id", async () => {
    const posted = await run(
      handlers({
        load: async (task, onProgress) => {
          expect(task).toBe("embed");
          onProgress(0.5, "onnx/model_quantized.onnx");
        },
      }),
      { id: 7, type: "load", task: "embed" },
    );
    expect(posted.map((p) => p.msg)).toEqual([
      { id: 7, type: "progress", ratio: 0.5, file: "onnx/model_quantized.onnx" },
      { id: 7, type: "result", value: null },
    ]);
  });

  it("returns an embedding and transfers its buffer instead of copying it", async () => {
    const vec = new Float32Array([0.1, 0.2]);
    const posted = await run(handlers({ embed: async () => vec }), { id: 1, type: "embed", text: "hi" });
    expect(posted[0].msg).toEqual({ id: 1, type: "result", value: vec });
    expect(posted[0].transfer).toEqual([vec.buffer]);
  });

  it("returns a transcript", async () => {
    const posted = await run(handlers(), { id: 2, type: "transcribe", audio: new Float32Array(4) });
    expect(posted.map((p) => p.msg)).toEqual([{ id: 2, type: "result", value: "hello" }]);
  });

  it("turns a failing handler into an error reply (it never throws out of the worker)", async () => {
    const posted = await run(
      handlers({
        load: async () => {
          throw new Error("model file missing");
        },
      }),
      { id: 3, type: "load", task: "asr" },
    );
    expect(posted.map((p) => p.msg)).toEqual([{ id: 3, type: "error", message: "model file missing" }]);
  });

  it("rejects an unknown message type", async () => {
    const posted = await run(handlers(), { id: 4, type: "nope" } as unknown as MlRequest);
    expect(posted[0].msg).toMatchObject({ id: 4, type: "error" });
  });
});

describe("main-thread client", () => {
  it("matches replies to requests by id, even out of order", async () => {
    const sent: MlRequest[] = [];
    const c = createClient((req) => sent.push(req));
    const a = c.request({ type: "embed", text: "a" });
    const b = c.request({ type: "transcribe", audio: new Float32Array(1) });
    expect(sent.map((r) => r.id)).toEqual([1, 2]);
    c.handle({ id: 2, type: "result", value: "words" });
    c.handle({ id: 1, type: "result", value: new Float32Array([9]) });
    await expect(b).resolves.toBe("words");
    await expect(a).resolves.toEqual(new Float32Array([9]));
    expect(c.pending()).toBe(0);
  });

  it("routes progress to the caller of that request only", async () => {
    const c = createClient(() => {});
    const onA = vi.fn();
    const onB = vi.fn();
    const a = c.request({ type: "load", task: "embed" }, onA);
    c.request({ type: "load", task: "asr" }, onB);
    c.handle({ id: 1, type: "progress", ratio: 0.25, file: "x" });
    expect(onA).toHaveBeenCalledWith(0.25, "x");
    expect(onB).not.toHaveBeenCalled();
    c.handle({ id: 1, type: "result", value: null });
    await expect(a).resolves.toBeNull();
  });

  it("rejects with the worker's error message", async () => {
    const c = createClient(() => {});
    const p = c.request({ type: "embed", text: "a" });
    c.handle({ id: 1, type: "error", message: "boom" });
    await expect(p).rejects.toThrow("boom");
  });

  it("failAll rejects every pending request (worker crashed) and ignores late replies", async () => {
    const c = createClient(() => {});
    const a = c.request({ type: "embed", text: "a" });
    const b = c.request({ type: "load", task: "embed" });
    c.failAll(new Error("worker died"));
    await expect(a).rejects.toThrow("worker died");
    await expect(b).rejects.toThrow("worker died");
    expect(() => c.handle({ id: 1, type: "result", value: null })).not.toThrow();
    expect(c.pending()).toBe(0);
  });

  it("rejects when the request cannot even be posted", async () => {
    const c = createClient(() => {
      throw new Error("no worker");
    });
    await expect(c.request({ type: "embed", text: "a" })).rejects.toThrow("no worker");
    expect(c.pending()).toBe(0);
  });

  it("transfers the audio buffer to the worker", () => {
    const transfers: (Transferable[] | undefined)[] = [];
    const c = createClient((_req, transfer) => transfers.push(transfer));
    const audio = new Float32Array(8);
    c.request({ type: "transcribe", audio });
    expect(transfers[0]).toEqual([audio.buffer]);
  });
});
