import { describe, it, expect } from "vitest";
import { createMlHost, type WorkerLike } from "./host";
import type { MlRequest, MlResponse } from "./protocol";

/** A stand-in for the ML worker: records what it was sent and lets the test answer or crash it. */
class FakeWorker implements WorkerLike {
  sent: MlRequest[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<MlResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(msg: MlRequest) {
    this.sent.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  reply(msg: MlResponse) {
    this.onmessage?.({ data: msg } as MessageEvent<MlResponse>);
  }
  crash(message = "worker script failed") {
    this.onerror?.({ message } as ErrorEvent);
  }
}

describe("ML worker host", () => {
  it("starts the worker lazily, on the first request only", () => {
    const made: FakeWorker[] = [];
    const host = createMlHost(() => {
      const w = new FakeWorker();
      made.push(w);
      return w;
    });
    expect(made).toHaveLength(0);
    void host.embed("a");
    void host.embed("b");
    expect(made).toHaveLength(1);
    expect(made[0].sent.map((m) => m.type)).toEqual(["embed", "embed"]);
  });

  it("a crashed worker fails its pending requests, and the next request starts a fresh one", async () => {
    const made: FakeWorker[] = [];
    const host = createMlHost(() => {
      const w = new FakeWorker();
      made.push(w);
      return w;
    });
    const p = host.load("embed");
    made[0].crash("out of memory");
    await expect(p).rejects.toThrow("out of memory");
    expect(made[0].terminated).toBe(true);

    const q = host.embed("again");
    expect(made).toHaveLength(2);
    made[1].reply({ id: made[1].sent[0].id, type: "result", value: new Float32Array([1]) });
    await expect(q).resolves.toEqual(new Float32Array([1]));
  });

  it("a worker that cannot be created rejects the request instead of throwing", async () => {
    const host = createMlHost(() => {
      throw new Error("Worker is not defined");
    });
    await expect(host.transcribe(new Float32Array(1))).rejects.toThrow("Worker is not defined");
  });

  it("passes load progress through", async () => {
    let w!: FakeWorker;
    const host = createMlHost(() => (w = new FakeWorker()));
    const seen: number[] = [];
    const p = host.load("asr", (r) => seen.push(r));
    w.reply({ id: 1, type: "progress", ratio: 0.4 });
    w.reply({ id: 1, type: "result", value: null });
    await p;
    expect(seen).toEqual([0.4]);
  });
});
