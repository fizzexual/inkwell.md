// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  installed: true,
  generated: 0,
  /** resolves the running fake generation (tests that want to Stop mid-way leave it pending) */
  release: null as null | (() => void),
  hold: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "offline_model_status")
      return { installed: h.installed, downloading: false, bytes_on_disk: h.installed ? 10 : 0, total_bytes: 10 };
    if (cmd === "secrets_get") return {};
    return null;
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("../store/useVault", () => ({
  useVault: {
    getState: () => ({
      notes: [
        { id: "1", title: "Project Falcon", content: "Cut-over 14 November." },
        { id: "2", title: "Shopping", content: "milk" },
      ],
      notesById: new Map(),
    }),
  },
}));
vi.mock("./agent", () => ({ runVaultAgent: vi.fn(async () => ({ text: "cloud", tokens: 1 })) }));
vi.mock("../search/semantic", () => ({
  semanticSearch: vi.fn(async () => [{ id: "1", score: 0.8 }]),
  isIndexWarm: () => true,
}));
// the worker: a fake generator that streams three tokens and honours the abort signal
vi.mock("./offline/host", () => ({
  offlineChat: {
    load: vi.fn(async () => ({ device: "webgpu" })),
    generate: vi.fn(async (_m: unknown, _max: number, onToken: (t: string) => void, signal?: AbortSignal) => {
      h.generated++;
      let text = "";
      for (const t of ["The cut-over", " is 14 November", " — [[Project Falcon]]."]) {
        if (signal?.aborted) return { text, tokens: 1, aborted: true };
        text += t;
        onToken(t);
        if (h.hold && text.length > 15) await new Promise<void>((r) => (h.release = r));
      }
      return { text, tokens: 3, aborted: !!signal?.aborted };
    }),
  },
}));

const settle = () => new Promise((r) => setTimeout(r, 0));

async function boot() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  vi.resetModules();
  localStorage.clear();
  const chat = await import("./useChat");
  await chat.keysReady;
  const model = await import("./offline/model");
  await model.useOfflineModel.getState().refresh();
  chat.useChat.getState().setProvider("inkwell-offline");
  return { useChat: chat.useChat, agent: await import("./agent") };
}

beforeEach(() => {
  h.installed = true;
  h.generated = 0;
  h.hold = false;
  h.release = null;
});

describe("chat with the Inkwell offline provider", () => {
  it("before the model is downloaded: says so, opens the provider list, generates nothing", async () => {
    h.installed = false;
    const { useChat } = await boot();
    await useChat.getState().send("When is the cut-over?");
    expect(useChat.getState().error).toMatch(/download/i);
    expect(useChat.getState().keyManagerOpen).toBe(true);
    expect(h.generated).toBe(0);
  });

  it("streams the answer, ends with [[links]], uses no network and never runs the cloud agent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { useChat, agent } = await boot();
    const partials: string[] = [];
    const unsub = useChat.subscribe((s) => s.streaming && partials.push(s.streaming));
    await useChat.getState().send("When is the cut-over?");
    unsub();
    expect(partials).toContain("The cut-over");
    const s = useChat.getState();
    expect(s.status).toBe("idle");
    expect(s.streaming).toBe("");
    const last = s.messages[s.messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.content).toContain("The cut-over is 14 November");
    expect(last.content).toContain("[[Project Falcon]]");
    expect(agent.runVaultAgent).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("Stop ends the run at once and keeps what was streamed so far", async () => {
    h.hold = true;
    const { useChat } = await boot();
    const run = useChat.getState().send("When is the cut-over?");
    for (let i = 0; i < 20 && !h.release; i++) await settle();
    expect(useChat.getState().status).toBe("running");
    useChat.getState().stop();
    expect(useChat.getState().status).toBe("idle");
    h.release?.();
    await run;
    const s = useChat.getState();
    expect(s.status).toBe("idle");
    expect(s.streaming).toBe("");
    const last = s.messages[s.messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.content).toContain("The cut-over is 14 November");
    expect(last.content).toContain("(stopped)");
    expect(last.content).not.toContain("[[Project Falcon]].");
  });

  it("listing models for the offline provider touches no network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { useChat } = await boot();
    await useChat.getState().loadModels("inkwell-offline", true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useChat.getState().modelsError["inkwell-offline"] ?? "").toBe("");
    fetchSpy.mockRestore();
  });
});
