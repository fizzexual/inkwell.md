// @vitest-environment jsdom
// The vault menu's "Keep git history" toggle (disk vaults only) and "Commit now".
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

const h = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("../vault/disk", async (orig) => {
  const actual = await orig<typeof import("../vault/disk")>();
  return {
    ...actual,
    gitInfo: async () => ({ repo: true, created: false, branch: "main" }),
    gitEnable: async () => (h.calls.push("enable"), { repo: true, created: true, branch: "main" }),
    gitCommit: async () => (h.calls.push("commit"), null),
  };
});

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
});
const flush = () => act(async () => {});
const item = (text: RegExp) =>
  [...document.querySelectorAll<HTMLButtonElement>(".ctx-menu button")].find((b) => text.test(b.textContent ?? ""));

async function mountSidebar(disk: boolean) {
  const { useVault } = await import("../store/useVault");
  if (disk) useVault.getState().loadDiskVault("C:/v", [{ id: "a.md", title: "A", folder: "", kind: "note", links: [], content: "# A" }]);
  const { default: Sidebar } = await import("./Sidebar");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Sidebar />));
  const openMenu = () => act(() => document.querySelector<HTMLButtonElement>(".vault-name")!.click());
  return { useVault, openMenu };
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  h.calls = [];
});

describe("vault menu → Keep git history", () => {
  it("is a checkbox that turns git history on; then Commit now appears", async () => {
    const { openMenu } = await mountSidebar(true);
    openMenu();
    const toggle = item(/Keep git history/)!;
    expect(toggle.getAttribute("role")).toBe("menuitemcheckbox");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(item(/Commit now/)).toBeUndefined();
    act(() => toggle.click());
    await flush();
    expect(h.calls).toEqual(["enable", "commit"]);
    openMenu();
    expect(item(/Keep git history/)!.getAttribute("aria-checked")).toBe("true");
    act(() => item(/Commit now/)!.click());
    await flush();
    expect(h.calls).toEqual(["enable", "commit", "commit"]);
  });

  it("isn't offered for the built-in (non-disk) vault", async () => {
    const { openMenu } = await mountSidebar(false);
    openMenu();
    expect(item(/Keep git history/)).toBeUndefined();
  });
});
