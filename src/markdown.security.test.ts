// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown, type RenderCtx } from "./markdown";

const notes: Record<string, { title: string; content: string }> = {
  target: { title: "Target", content: "# Target\n\nbody" },
  evil: { title: '<img src=x onerror="alert(1)">', content: "hi" },
};
const ctx: RenderCtx = {
  resolve: (t) => (t.trim() === "Target" ? "target" : t.trim() === "Evil" ? "evil" : undefined),
  getNote: (id) => notes[id],
};

function dom(md: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = renderMarkdown(md, ctx);
  return el;
}

/** every attribute name in the rendered tree */
function attrs(el: HTMLElement): string[] {
  return [...el.querySelectorAll("*")].flatMap((n) => [...n.attributes].map((a) => a.name));
}

describe("renderMarkdown never emits executable HTML", () => {
  it("drops event-handler attributes from raw HTML", () => {
    const el = dom('hello <img src=x onerror="alert(1)">');
    expect(attrs(el).filter((a) => a.startsWith("on"))).toEqual([]);
  });

  it("drops <script>, <iframe>, <object>", () => {
    const el = dom("<script>alert(1)</script><iframe src=x></iframe><object data=x></object>");
    expect(el.querySelectorAll("script, iframe, object").length).toBe(0);
  });

  it("drops javascript: links", () => {
    const el = dom("[click](javascript:alert(1)) <a href=\"javascript:alert(2)\">x</a>");
    for (const a of el.querySelectorAll("a")) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^\s*javascript:/i);
    }
  });

  it("treats HTML in a wikilink alias as text", () => {
    const el = dom('[[Target|<img src=x onerror="alert(1)">]]');
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("a.wikilink")?.textContent).toContain("<img");
  });

  it("treats HTML in a missing wikilink as text", () => {
    const el = dom("[[<svg onload=alert(1)>]]");
    expect(el.querySelector("svg")).toBeNull();
    expect(attrs(el).filter((a) => a.startsWith("on"))).toEqual([]);
  });

  it("treats an embedded note's HTML title as text", () => {
    const el = dom("![[Evil]]");
    expect(el.querySelector(".embed-head")?.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(el.querySelector(".embed-head img")).toBeNull();
  });

  it("drops handlers inside callout titles", () => {
    const el = dom('> [!note] <img src=x onerror="alert(1)">\n> body');
    expect(attrs(el).filter((a) => a.startsWith("on"))).toEqual([]);
  });
});

describe("renderMarkdown keeps the app's own markup", () => {
  it("keeps wikilinks, tags, heading ids, callouts, tasks and math", () => {
    const el = dom(
      "# Title\n\nSee [[Target]] and #ml/deep.\n\n> [!tip] Hint\n> body\n\n- [x] done\n\n$a^2$",
    );
    const link = el.querySelector("a.wikilink") as HTMLElement;
    expect(link.dataset.note).toBe("target");
    expect(link.getAttribute("href")).toBe("#/note/target");
    expect((el.querySelector("a.tag") as HTMLElement).dataset.tag).toBe("ml/deep");
    // the outline finds headings by data-heading (an id of "title" is dropped as DOM clobbering)
    expect((el.querySelector("h1") as HTMLElement).dataset.heading).toBe("title");
    expect(el.querySelector(".callout.callout-tip .callout-title")?.textContent).toContain("Hint");
    expect(el.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(el.querySelector(".katex")).not.toBeNull();
  });

  it("keeps a mermaid host div with the source as text", () => {
    const el = dom("```mermaid\ngraph TD; A-->B\n```");
    expect(el.querySelector(".mermaid-src")?.textContent).toContain("A-->B");
  });

  it("keeps embeds", () => {
    const el = dom("![[Target]]");
    expect((el.querySelector("a.embed-head") as HTMLElement).dataset.note).toBe("target");
    expect(el.querySelector(".embed-body")?.textContent).toContain("body");
  });

  it("keeps normal https links", () => {
    const el = dom("[site](https://example.com)");
    expect(el.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });
});
