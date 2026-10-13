// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const calls: { cmd: string; args: Record<string, unknown> }[] = [];
vi.mock("@tauri-apps/api/core", () => {
  class Channel<T> {
    onmessage: (m: T) => void = () => {};
  }
  return {
    Channel,
    invoke: vi.fn(async (cmd: string, args: Record<string, unknown> = {}) => {
      calls.push({ cmd, args });
      if (cmd === "cli_ai_detect") return { claude: "2.1.289 (Claude Code)", codex: null };
      if (cmd === "secrets_get") return {};
      if (cmd === "cli_ai_run") return { text: '"The fixed text."', tokens: 3 };
      throw new Error(`unexpected command ${cmd}`);
    }),
  };
});
vi.mock("../store/useVault", () => ({ useVault: { getState: () => ({}) } }));
vi.mock("../search/semantic", () => ({ semanticSearch: vi.fn(), isIndexWarm: () => false }));

describe("inline editor actions with Claude Code", () => {
  it("go through the CLI with the selection as untrusted text, no key needed", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const { useChat, keysReady, clisReady } = await import("./useChat");
    await keysReady;
    await clisReady;
    useChat.getState().setProvider("claude-code");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { completeText } = await import("./complete");
    expect(await completeText("Fix grammar", "teh fixed text")).toBe("The fixed text.");
    const run = calls.find((c) => c.cmd === "cli_ai_run")!;
    expect(run.args.provider).toBe("claude-code");
    expect(run.args.prompt).toMatch(/<untrusted_text>\nteh fixed text\n<\/untrusted_text>/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
