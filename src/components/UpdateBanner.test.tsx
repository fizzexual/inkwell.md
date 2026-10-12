// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUpdater } from "../updater/useUpdater";
import UpdateBanner from "./UpdateBanner";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
});

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<UpdateBanner />));
}

const buttons = () => Array.from(host!.querySelectorAll("button")).map((b) => b.textContent?.trim() || b.getAttribute("aria-label"));

describe("update banner", () => {
  it("shows nothing until an update is found", () => {
    act(() => useUpdater.setState({ phase: "idle", text: "" }));
    mount();
    expect(host!.textContent).toBe("");
    act(() => useUpdater.setState({ phase: "checking" }));
    expect(host!.textContent).toBe("");
  });

  it("an available update: one click on Install & restart installs; Later hides it", () => {
    const install = vi.fn(async () => {});
    const dismiss = vi.fn();
    act(() => useUpdater.setState({ phase: "available", text: "Inkwell 0.2.0 is available", install, dismiss }));
    mount();
    expect(host!.textContent).toContain("Inkwell 0.2.0 is available");
    expect(buttons()).toEqual(["Install & restart", "Later"]);
    act(() => host!.querySelector<HTMLButtonElement>(".update-install")!.click());
    expect(install).toHaveBeenCalledTimes(1);
    act(() => host!.querySelector<HTMLButtonElement>(".update-later")!.click());
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("while downloading it shows the progress and offers no second install or Later", () => {
    act(() => useUpdater.setState({ phase: "downloading", text: "Downloading… 42%" }));
    mount();
    expect(host!.textContent).toContain("Downloading… 42%");
    expect(buttons()).toEqual([]);
    expect(host!.querySelector("[role=status]")).not.toBeNull();
  });
});
