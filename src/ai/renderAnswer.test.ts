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
