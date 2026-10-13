import { describe, expect, it, vi } from "vitest";
import { createChatHost, type ChatWorkerLike } from "./host";
import type { ChatRequest, ChatResponse } from "./protocol";

/** A worker that streams one token per request and then either finishes or hangs (a CPU-bound run). */
function fakeWorker(opts: { hangOnCancel: boolean }) {
  const made: (ChatWorkerLike & { terminated: boolean; got: ChatRequest[] })[] = [];
  const make = () => {
    const w = {
      terminated: false,
      got: [] as ChatRequest[],
      onmessage: null as ((e: MessageEvent<ChatResponse>) => void) | null,
      onerror: null as ((e: ErrorEvent) => void) | null,
      postMessage(msg: ChatRequest) {
        w.got.push(msg);
        const reply = (m: ChatResponse) => queueMicrotask(() => w.onmessage?.({ data: m } as MessageEvent<ChatResponse>));
        if (msg.type === "generate") reply({ id: msg.id, type: "token", text: "Hi" });
        if (msg.type === "cancel" && !opts.hangOnCancel) reply({ id: msg.target, type: "done", text: "Hi", tokens: 1 });
      },
      terminate() {
        w.terminated = true;
      },
    };
    made.push(w);
    return w;
  };
  return { make, made };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("offline chat host", () => {
  it("a worker that winds down after Stop is kept (the model stays loaded)", async () => {
    vi.useFakeTimers();
    const { make, made } = fakeWorker({ hangOnCancel: false });
    const host = createChatHost(make, 2000);
    const ctrl = new AbortController();
    const run = host.generate([{ role: "user", content: "x" }], 8, () => ctrl.abort(), ctrl.signal);
    await vi.advanceTimersByTimeAsync(0);
    expect((await run).aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(made[0].terminated).toBe(false);
    vi.useRealTimers();
  });

  it("a worker stuck in a run after Stop is restarted, and the next question gets a fresh one", async () => {
    vi.useFakeTimers();
    const { make, made } = fakeWorker({ hangOnCancel: true });
    const host = createChatHost(make, 2000);
    const ctrl = new AbortController();
    const run = host.generate([{ role: "user", content: "x" }], 8, () => ctrl.abort(), ctrl.signal);
    await vi.advanceTimersByTimeAsync(0);
    expect((await run).aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2001);
    expect(made[0].terminated).toBe(true);
    void host.generate([{ role: "user", content: "y" }], 8, () => {});
    expect(made).toHaveLength(2);
    vi.useRealTimers();
    await flush();
  });

  it("a crashed worker fails the waiting request and the next one starts a new worker", async () => {
    const made: ChatWorkerLike[] = [];
    const host = createChatHost(() => {
      const w: ChatWorkerLike = { postMessage() {}, terminate() {}, onmessage: null, onerror: null };
      made.push(w);
      return w;
    });
    const p = host.generate([{ role: "user", content: "x" }], 8, () => {});
    made[0].onerror?.({ message: "out of memory", preventDefault() {} } as ErrorEvent);
    await expect(p).rejects.toThrow("out of memory");
    void host.load().catch(() => {});
    expect(made).toHaveLength(2);
  });
});
