// @vitest-environment jsdom
// Large-vault benchmark: `npm run bench`. 5,000 generated notes (scripts/gen-vault.mjs) plus three
// 20,000-word notes. Measures what a user feels: opening the vault, one keystroke in a long note
// (store update alone, and with the real sidebar + two panes + inspector rendered), the command
// palette / search filtering, and the semantic index's per-call bookkeeping (the model is faked).
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { bench, describe, vi } from "vitest";

vi.mock("../ml/host", () => ({
  ml: { load: async () => null, embed: async () => new Float32Array([1, 0, 0]), transcribe: async () => "" },
}));

import { generateVault, LONG_FOLDER } from "../../scripts/gen-vault.mjs";
import { diskNoteToNote } from "../vault/disk";
import { useVault } from "../store/useVault";
import { ensureIndexed, relatedNotes } from "../search/semantic";
import Sidebar from "../components/Sidebar";
import NotesWorkspace from "../components/NotesWorkspace";
import Inspector from "../components/Inspector";
import CommandPalette from "../components/CommandPalette";
import SearchPanel from "../components/SearchPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;

const files = generateVault({ count: 5000, seed: 1 });
const notes = files.map(diskNoteToNote);
const LONG = `${LONG_FOLDER}/Long Read 1.md`;
// a reading-view note in the second pane: it has a ```query block (the generator puts one in every 50th)
const QUERY_NOTE = notes[50].id;
const longBase = notes.find((n) => n.id === LONG)!.content!;

// silence React's act() warnings / Inspector's lazy loads in the output
console.error = () => {};

const load = () => useVault.getState().loadDiskVault("bench-vault", notes);
/** Opening the vault cold: fresh note objects, as read from disk (nothing parsed yet). */
const loadFresh = () => useVault.getState().loadDiskVault("bench-vault", files.map(diskNoteToNote));

let typed = 0;
/** One keystroke: append a character to the end of the long note. */
const keystroke = () => useVault.getState().updateContent(LONG, longBase + "x".repeat(++typed % 50));

function mountApp(mode: "source" | "live") {
  load();
  const folders = new Set<string>();
  for (const n of notes) for (let p = n.folder; p; p = p.slice(0, Math.max(0, p.lastIndexOf("/")))) folders.add(p);
  useVault.setState({
    panes: [
      { tabs: [LONG], active: LONG },
      { tabs: [QUERY_NOTE], active: QUERY_NOTE },
    ],
    activePane: 0,
    selectedId: LONG,
    centerView: "article",
    editing: true,
    editorMode: mode,
    expanded: folders,
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <>
        <Sidebar />
        <NotesWorkspace />
        <Inspector />
      </>,
    ),
  );
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

describe("vault of 5,000 notes", () => {
  bench("load + derive (loadDiskVault)", loadFresh, { iterations: 5, time: 0, warmupIterations: 1 });
  bench("keystroke in a 20k-word note: store update", keystroke, {
    iterations: 30,
    time: 0,
    setup: load,
  });
  let retitles = 0;
  bench("keystroke in the title of a 20k-word note (retitles it)", () => {
    useVault.getState().updateContent(LONG, longBase.replace("# Long Read 1", `# Long Read 1${"x".repeat(++retitles % 50)}`));
  }, { iterations: 30, time: 0, setup: load });
});

describe("keystroke with the app rendered (sidebar all expanded, 2 panes, inspector)", () => {
  for (const mode of ["source", "live"] as const) {
    let unmount = () => {};
    bench(`${mode} editor`, () => act(keystroke), {
      iterations: 15,
      time: 0,
      warmupIterations: 2,
      setup: () => {
        unmount = mountApp(mode);
      },
      teardown: () => unmount(),
    });
  }
});

describe("filtering", () => {
  const setInput = (input: HTMLInputElement, value: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const QUERIES = ["at", "atten", "attention 12", "x"];
  let host: HTMLDivElement;
  let unmount = () => {};
  const mount = (el: React.ReactElement) => () => {
    load();
    useVault.setState({ paletteOpen: true, sidebarView: "search" });
    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(el));
    unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
  };
  let qi = 0;
  const type = () => act(() => setInput(host.querySelector("input")!, QUERIES[qi++ % QUERIES.length]));
  bench("command palette: one query change", type, {
    iterations: 20,
    time: 0,
    setup: mount(<CommandPalette />),
    teardown: () => unmount(),
  });
  bench("search panel: one query change", type, {
    iterations: 20,
    time: 0,
    setup: mount(<SearchPanel />),
    teardown: () => unmount(),
  });
});

describe("semantic index bookkeeping (model faked, index warm)", () => {
  bench("relatedNotes() on an unchanged vault", () => relatedNotes(LONG, notes).then(() => {}), {
    iterations: 10,
    time: 0,
    setup: () => ensureIndexed(notes),
  });
});
