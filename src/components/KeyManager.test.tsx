// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
// each case re-imports the store and the icon set; a cold transform can pass the 5s default
vi.setConfig({ testTimeout: 30_000 });

// zustand's server snapshot is the initial state, so render for real in jsdom
async function markup(el: ReturnType<typeof createElement>) {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(el));
  const html = host.innerHTML;
  await act(async () => root.unmount());
  return html;
}

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => ({})) }));
vi.mock("../store/useVault", () => ({ useVault: { getState: () => ({}) } }));
vi.mock("../ai/agent", () => ({ runVaultAgent: vi.fn() }));
vi.mock("../search/semantic", () => ({ semanticSearch: vi.fn(), isIndexWarm: () => false }));

async function render(desktop: boolean, keys: Record<string, string>) {
  const w = window as unknown as Record<string, unknown>;
  if (desktop) w.__TAURI_INTERNALS__ = {};
  else delete w.__TAURI_INTERNALS__;
  vi.resetModules();
  const { useChat, keysReady } = await import("../ai/useChat");
  await keysReady;
  useChat.setState({ keyManagerOpen: true, keys });
  const { default: KeyManager } = await import("./KeyManager");
  return markup(createElement(KeyManager));
}

describe("KeyManager says where keys are stored", () => {
  it("desktop app: Windows Credential Manager", async () => {
    expect(await render(true, { groq: "gsk_1" })).toContain("Saved in Windows Credential Manager");
    expect(await render(true, {})).toContain("Windows Credential Manager");
  });

  it("browser: this browser's storage", async () => {
    const html = await render(false, { groq: "gsk_1" });
    expect(html).toContain("kept in this browser");
    expect(html).not.toContain("Credential Manager");
  });

  it("shows a keychain error inside the dialog", async () => {
    const w = window as unknown as Record<string, unknown>;
    w.__TAURI_INTERNALS__ = {};
    vi.resetModules();
    const { useChat, keysReady } = await import("../ai/useChat");
    await keysReady;
    useChat.setState({ keyManagerOpen: true, error: "Couldn't save the Groq key to Windows Credential Manager: locked" });
    const { default: KeyManager } = await import("./KeyManager");
    expect(await markup(createElement(KeyManager))).toContain("Couldn't save the Groq key");
  });
});
