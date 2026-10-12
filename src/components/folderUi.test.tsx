// @vitest-environment jsdom
// Folder UI in the sidebar: right-click menu, delete confirmation, inline rename, New folder.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no matchMedia (the sidebar's smooth scroll asks about reduced motion)
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

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
});

function mount(el: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}

const flush = () => act(async () => {});

function button(text: string | RegExp): HTMLButtonElement {
  const all = [...document.querySelectorAll("button")];
  const b = all.find((x) => (typeof text === "string" ? x.textContent?.trim() === text : text.test(x.textContent ?? "")));
  if (!b) throw new Error(`no button ${text}; have: ${all.map((x) => x.textContent?.trim()).join(" | ")}`);
  return b;
}

function typeInto(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });

async function setup() {
  vi.resetModules();
  localStorage.clear();
  const { useVault } = await import("../store/useVault");
  useVault.getState().importNotes([
    { title: "Alpha", content: "# Alpha\n", folder: "Projects" },
    { title: "Beta", content: "# Beta\n", folder: "Projects/Sub" },
  ]);
  useVault.getState().addFolder("Empty");
  return useVault;
}

beforeEach(() => localStorage.clear());

describe("folder right-click menu", () => {
  it("asks before deleting a folder with notes, then deletes it with Undo", async () => {
    const useVault = await setup();
    const { default: FolderMenu } = await import("./FolderMenu");
    act(() => useVault.getState().openFolderMenu(10, 10, "Projects"));
    mount(<FolderMenu />);
    act(() => button(/Delete folder/).click());
    expect(document.body.textContent).toContain("Delete folder and 2 notes?");
    expect(useVault.getState().notesIn("Projects")).toBe(2); // nothing deleted yet
    act(() => button("Delete").click());
    await flush();
    expect(useVault.getState().notesIn("Projects")).toBe(0);
    expect(useVault.getState().toasts.at(-1)?.action?.label).toBe("Undo");
  });

  it("deletes an empty folder in one click", async () => {
    const useVault = await setup();
    const { default: FolderMenu } = await import("./FolderMenu");
    act(() => useVault.getState().openFolderMenu(10, 10, "Empty"));
    mount(<FolderMenu />);
    act(() => button(/Delete folder/).click());
    await flush();
    expect(useVault.getState().folders).not.toContain("Empty");
  });

  it("New note here puts the note in that folder", async () => {
    const useVault = await setup();
    const { default: FolderMenu } = await import("./FolderMenu");
    act(() => useVault.getState().openFolderMenu(10, 10, "Empty"));
    mount(<FolderMenu />);
    act(() => button("New note here").click());
    const s = useVault.getState();
    expect(s.notesById.get(s.selectedId)?.folder).toBe("Empty");
  });

  it("New subfolder makes one and starts renaming it", async () => {
    const useVault = await setup();
    const { default: FolderMenu } = await import("./FolderMenu");
    act(() => useVault.getState().openFolderMenu(10, 10, "Projects"));
    mount(<FolderMenu />);
    act(() => button("New subfolder").click());
    await flush();
    expect(useVault.getState().folders).toContain("Projects/New folder");
    expect(useVault.getState().renamingFolder).toBe("Projects/New folder");
  });
});

describe("sidebar folders", () => {
  it("renames a folder inline: Enter saves, and its notes move with it", async () => {
    const useVault = await setup();
    const { default: Sidebar } = await import("./Sidebar");
    act(() => useVault.setState({ sidebarView: "notes" }));
    mount(<Sidebar />);
    expect(document.body.textContent).toContain("Empty"); // an empty folder shows
    act(() => useVault.getState().setRenamingFolder("Projects"));
    const input = document.querySelector<HTMLInputElement>("input.tree-rename")!;
    expect(input.value).toBe("Projects");
    typeInto(input, "Work");
    key(input, "Enter");
    await flush();
    const s = useVault.getState();
    expect(s.notes.find((n) => n.title === "Beta")!.folder).toBe("Work/Sub");
    expect(s.renamingFolder).toBeNull();
  });

  it("Esc cancels an inline rename; a refused name keeps the folder as it was", async () => {
    const useVault = await setup();
    const { default: Sidebar } = await import("./Sidebar");
    act(() => useVault.setState({ sidebarView: "notes" }));
    mount(<Sidebar />);
    act(() => useVault.getState().setRenamingFolder("Projects"));
    let input = document.querySelector<HTMLInputElement>("input.tree-rename")!;
    typeInto(input, "Nope");
    key(input, "Escape");
    expect(useVault.getState().renamingFolder).toBeNull();
    expect(useVault.getState().notesIn("Projects")).toBe(2);
    act(() => useVault.getState().setRenamingFolder("Projects"));
    input = document.querySelector<HTMLInputElement>("input.tree-rename")!;
    typeInto(input, "Empty"); // taken
    key(input, "Enter");
    await flush();
    expect(useVault.getState().notesIn("Projects")).toBe(2);
    expect(useVault.getState().toasts.at(-1)?.message).toMatch(/already exists/);
  });

  it("the New folder button makes a folder and starts renaming it", async () => {
    const useVault = await setup();
    const { default: Sidebar } = await import("./Sidebar");
    act(() => useVault.setState({ sidebarView: "notes" }));
    mount(<Sidebar />);
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="New folder"]')!.click());
    await flush();
    expect(useVault.getState().folders).toContain("New folder");
    expect(document.querySelector<HTMLInputElement>("input.tree-rename")?.value).toBe("New folder");
  });
});
