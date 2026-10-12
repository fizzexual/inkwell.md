// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// a fake Windows Credential Manager behind the mocked Tauri invoke
const h = vi.hoisted(() => ({
  vault: new Map<string, string>(),
  calls: [] as { cmd: string; args: Record<string, unknown> }[],
  failSet: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown> = {}) => {
    h.calls.push({ cmd, args });
    if (cmd === "secret_set") {
      if (h.failSet) throw new Error("credential store locked");
      h.vault.set(args.provider as string, args.key as string);
      return;
    }
    if (cmd === "secret_delete") {
      h.vault.delete(args.provider as string);
      return;
    }
    if (cmd === "secrets_get") {
      const out: Record<string, string> = {};
      for (const p of args.providers as string[]) if (h.vault.has(p)) out[p] = h.vault.get(p)!;
      return out;
    }
    throw new Error(`unexpected command ${cmd}`);
  }),
}));
// keep the store's heavy neighbours out of this test
vi.mock("../store/useVault", () => ({ useVault: { getState: () => ({}) } }));
vi.mock("./agent", () => ({ runVaultAgent: vi.fn() }));
vi.mock("../search/semantic", () => ({ semanticSearch: vi.fn(), isIndexWarm: () => false }));

const KEY = "inkwell.ai.v2";
const stored = () => JSON.parse(localStorage.getItem(KEY) || "{}");
const settle = () => new Promise((r) => setTimeout(r, 0));

async function boot(desktop: boolean) {
  const w = window as unknown as Record<string, unknown>;
  if (desktop) w.__TAURI_INTERNALS__ = {};
  else delete w.__TAURI_INTERNALS__;
  vi.resetModules();
  const mod = await import("./useChat");
  await mod.keysReady;
  return mod;
}

beforeEach(() => {
  localStorage.clear();
  h.vault.clear();
  h.calls.length = 0;
  h.failSet = false;
});

describe("AI keys in the desktop app (Windows Credential Manager)", () => {
  it("moves plaintext keys from localStorage into the keychain, then removes them", async () => {
    localStorage.setItem(KEY, JSON.stringify({ keys: { groq: "gsk_1", openai: "" }, provider: "groq" }));
    const { useChat } = await boot(true);
    expect(h.vault.get("groq")).toBe("gsk_1");
    expect(h.vault.has("openai")).toBe(false); // empty entries are not secrets
    expect(useChat.getState().keys.groq).toBe("gsk_1");
    expect(stored().keys).toBeUndefined();
    expect(localStorage.getItem(KEY)).not.toContain("gsk_1");
    expect(stored().provider).toBe("groq"); // the rest of the slice survives
  });

  it("migrates the v1 Anthropic key and drops the v1 entry", async () => {
    localStorage.setItem("inkwell.ai.v1", JSON.stringify({ apiKey: "sk-ant-1" }));
    const { useChat } = await boot(true);
    expect(h.vault.get("anthropic")).toBe("sk-ant-1");
    expect(useChat.getState().keys.anthropic).toBe("sk-ant-1");
    expect(localStorage.getItem("inkwell.ai.v1")).toBeNull();
    expect(localStorage.getItem(KEY) ?? "").not.toContain("sk-ant-1");
  });

  it("keeps a key in localStorage when the keychain write is refused", async () => {
    h.failSet = true;
    localStorage.setItem(KEY, JSON.stringify({ keys: { groq: "gsk_1" } }));
    const { useChat } = await boot(true);
    expect(useChat.getState().keys.groq).toBe("gsk_1"); // still usable this session
    expect(stored().keys).toEqual({ groq: "gsk_1" }); // not lost: retried next start
    // an unrelated save must not drop the unmigrated key either
    useChat.getState().setModel("llama-3.1-8b-instant");
    expect(stored().keys).toEqual({ groq: "gsk_1" });
  });

  it("loads keys from the keychain at startup", async () => {
    h.vault.set("mistral", "ms-1");
    const { useChat } = await boot(true);
    expect(useChat.getState().keys.mistral).toBe("ms-1");
    expect(localStorage.getItem(KEY) ?? "").not.toContain("ms-1");
  });

  it("saving a key writes the keychain, never localStorage; removing it deletes it", async () => {
    const { useChat } = await boot(true);
    useChat.getState().setKey("openai", "sk-x");
    await settle();
    expect(h.vault.get("openai")).toBe("sk-x");
    expect(stored().keys).toBeUndefined();
    expect(localStorage.getItem(KEY)).not.toContain("sk-x");

    useChat.getState().setKey("openai", "");
    await settle();
    expect(h.vault.has("openai")).toBe(false);
    expect(h.calls.at(-1)).toEqual({ cmd: "secret_delete", args: { provider: "openai" } });
  });

  it("writes keystrokes in order, so the last value typed is the one stored", async () => {
    const { useChat } = await boot(true);
    for (const v of ["s", "sk", "sk-", "sk-9"]) useChat.getState().setKey("openai", v);
    await settle();
    expect(h.vault.get("openai")).toBe("sk-9");
  });

  it("shows an error when the keychain refuses a new key", async () => {
    const { useChat } = await boot(true);
    h.failSet = true;
    useChat.getState().setKey("openai", "sk-x");
    await settle();
    await settle();
    expect(useChat.getState().error).toMatch(/Credential Manager/);
    expect(useChat.getState().keys.openai).toBe("sk-x"); // still works this session
  });
});

describe("AI keys in the browser build", () => {
  it("keeps the localStorage behaviour and never calls the keychain", async () => {
    localStorage.setItem(KEY, JSON.stringify({ keys: { groq: "gsk_1" } }));
    const { useChat } = await boot(false);
    expect(useChat.getState().keys.groq).toBe("gsk_1");
    useChat.getState().setKey("openai", "sk-x");
    await settle();
    expect(stored().keys).toEqual({ groq: "gsk_1", openai: "sk-x" });
    expect(h.calls).toEqual([]);
  });
});
