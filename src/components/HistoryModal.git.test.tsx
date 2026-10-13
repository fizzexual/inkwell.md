// @vitest-environment jsdom
// The History modal's Git tab: a note's commits, what changed since one, and restoring it.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ calls: [] as string[] }));
const OLD = "a".repeat(40);
const NEW = "b".repeat(40);

vi.mock("../vault/disk", async (orig) => {
  const actual = await orig<typeof import("../vault/disk")>();
  return {
    ...actual,
    isTauri: () => true,
    gitInfo: async () => ({ repo: true, created: false, branch: "main" }),
    gitLog: async (rel: string) => {
      h.calls.push(`log ${rel}`);
      return [
        { id: NEW, time: Date.now() - 60_000, summary: "Inkwell: 1 note changed", author: "Inkwell" },
        { id: OLD, time: Date.now() - 3 * 3600_000, summary: "Inkwell: 2 notes changed", author: "Inkwell" },
      ];
    },
    gitShow: async (rel: string, id: string) => {
      h.calls.push(`show ${rel} ${id.slice(0, 1)}`);
      return id === OLD ? "# A\nfirst draft" : "# A\nsecond";
    },
    gitCommit: async () => (h.calls.push("commit"), null),
  };
});
vi.mock("../vault/sync", () => ({
  flushDiskSync: async () => {},
  onAfterCloseFlush: () => {},
  diskRelOf: (id: string) => (id.endsWith(".md") ? id : null),
}));

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
});

const flush = () => act(async () => {});
function button(text: string | RegExp): HTMLButtonElement {
  const all = [...document.querySelectorAll("button")];
  const b = all.find((x) => (typeof text === "string" ? x.textContent?.trim() === text : text.test(x.textContent ?? "")));
  if (!b) throw new Error(`no button ${text}; have: ${all.map((x) => x.textContent?.trim()).join(" | ")}`);
  return b;
}

async function open(gitOn: boolean) {
  if (gitOn) localStorage.setItem("inkwell.gitHistory.v1", JSON.stringify(["C:/v"]));
  const { useVault } = await import("../store/useVault");
  const { default: HistoryModal } = await import("./HistoryModal");
  useVault.getState().loadDiskVault("C:/v", [
    { id: "a.md", title: "A", folder: "", kind: "note", links: [], content: "# A\nsecond\nthird" },
  ]);
  useVault.getState().openArticle("a.md");
  useVault.setState({ historyOpen: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<HistoryModal />));
  act(() => button("Git").click());
  await flush();
  return useVault;
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  h.calls = [];
});

describe("History → Git", () => {
  it("lists the note's commits and shows what changed since the newest", async () => {
    await open(true);
    expect(h.calls).toEqual(["log a.md", "show a.md b"]);
    const items = [...document.querySelectorAll(".hist-item")].map((e) => e.textContent);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatch(/1 min ago.*1 note changed/);
    expect(document.querySelector(".hist-diff-add")?.textContent).toBe("+ third");
  });

  it("restoring an older commit puts its text back in the note and closes", async () => {
    const useVault = await open(true);
    act(() => (document.querySelectorAll(".hist-item")[1] as HTMLButtonElement).click());
    await flush();
    expect(document.querySelector(".hist-diff-del")?.textContent).toBe("- first draft");
    act(() => button(/Restore this version/).click());
    await flush();
    expect(useVault.getState().notesById.get("a.md")?.content).toBe("# A\nfirst draft");
    expect(useVault.getState().historyOpen).toBe(false);
  });

  it("with git history off it says where to turn it on", async () => {
    await open(false);
    expect(document.querySelector(".hist-empty")?.textContent).toMatch(/Keep git history/);
    expect(h.calls).toEqual([]);
  });
});
