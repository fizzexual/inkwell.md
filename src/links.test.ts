// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { externalUrl, installLinkGuard } from "./links";

describe("externalUrl", () => {
  it("accepts http, https and mailto", () => {
    expect(externalUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(externalUrl("http://example.com")).toBe("http://example.com/");
    expect(externalUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
  });
  it("rejects everything that could run or open local things", () => {
    for (const h of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "file:///C:/Windows/System32/calc.exe", "data:text/html,<b>", "vbscript:x", "C:\\x.exe", "ms-settings:"]) {
      expect(externalUrl(h)).toBeNull();
    }
  });
});

describe("installLinkGuard", () => {
  function click(href: string, open = vi.fn()) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const off = installLinkGuard(root, open);
    const a = document.createElement("a");
    a.setAttribute("href", href);
    a.textContent = "x";
    root.appendChild(a);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    off();
    root.remove();
    return { open, prevented: ev.defaultPrevented };
  }

  it("opens web links outside the app instead of navigating the app window", () => {
    const { open, prevented } = click("https://example.com");
    expect(prevented).toBe(true);
    expect(open).toHaveBeenCalledWith("https://example.com/");
  });

  it("blocks javascript: and file: links without opening anything", () => {
    for (const h of ["javascript:alert(1)", "file:///C:/x.exe"]) {
      const { open, prevented } = click(h);
      expect(prevented).toBe(true);
      expect(open).not.toHaveBeenCalled();
    }
  });

  it("lets the app's own blob: downloads through", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const open = vi.fn();
    const off = installLinkGuard(root, open);
    const a = document.createElement("a");
    a.href = "blob:http://localhost/abc";
    a.download = "note.md";
    root.appendChild(a);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    off();
    root.remove();
    expect(ev.defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("leaves in-app #/note links alone", () => {
    const { open, prevented } = click("#/note/target");
    expect(prevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
