// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => ({ claude: "2.1.289 (Claude Code)", codex: null })) }));
vi.mock("../store/useVault", () => {
  const state = { notes: [], toggleAi: () => {}, openArticle: () => {}, resolve: () => undefined };
  const useVault = (sel: (s: typeof state) => unknown) => sel(state);
  useVault.getState = () => state;
  return { useVault };
});
vi.mock("../ai/agent", () => ({ runVaultAgent: vi.fn(), contextNotes: vi.fn(), vaultMap: vi.fn() }));
vi.mock("../search/semantic", () => ({ semanticSearch: vi.fn(), isIndexWarm: () => false }));

async function render(state: Record<string, unknown>) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  vi.resetModules();
  const { useChat, keysReady, clisReady } = await import("../ai/useChat");
  await keysReady;
  await clisReady;
  useChat.setState(state);
  const { default: AiPanel } = await import("./AiPanel");
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(createElement(AiPanel)));
  const html = host.innerHTML;
  await act(async () => root.unmount());
  return html;
}

describe("assistant panel with Claude Code", () => {
  it("streams the answer as it arrives, rendered as markdown", async () => {
    const html = await render({ provider: "claude-code", model: "default", status: "running", partial: "Your notes are **about** [[Alpha]]", messages: [{ role: "user", content: "q" }] });
    expect(html).toContain("<strong>about</strong>");
    expect(html).toContain('data-title="Alpha"');
  });

  it("needs no key and says edit proposals aren't available", async () => {
    const html = await render({ provider: "claude-code", model: "default", status: "idle", partial: "", messages: [] });
    expect(html).not.toContain("Add a key to start");
    expect(html).not.toContain("Set up an API key");
    expect(html).toMatch(/title="[^"]*Edit proposals aren't available with Claude Code[^"]*"/);
  });
});
