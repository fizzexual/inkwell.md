// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// the saved index loads asynchronously on launch; the test controls when
let loaded!: () => void;
let warm = false;
const relatedNotes = vi.fn(async () => [{ id: "b", score: 0.9 }]);
vi.mock("../search/semantic", () => ({
  relatedNotes,
  isIndexWarm: () => warm,
  whenIndexLoaded: () => new Promise<void>((r) => (loaded = r)),
}));

const { RelatedNotes } = await import("./Inspector");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  relatedNotes.mockClear();
  warm = false;
});

function mount(el: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}

describe("Related notes on launch", () => {
  it("fill in by themselves once last session's index has loaded", async () => {
    mount(<RelatedNotes noteId="a" />);
    expect(host!.textContent).toContain("Find related notes"); // nothing cached yet
    expect(relatedNotes).not.toHaveBeenCalled();

    warm = true;
    await act(async () => loaded());
    expect(relatedNotes).toHaveBeenCalledWith("a", expect.any(Array), 6, expect.any(Function));
  });

  it("stay on the button when there was no saved index (no model load behind the user's back)", async () => {
    mount(<RelatedNotes noteId="a" />);
    await act(async () => loaded());
    expect(relatedNotes).not.toHaveBeenCalled();
    expect(host!.textContent).toContain("Find related notes");
  });
});
