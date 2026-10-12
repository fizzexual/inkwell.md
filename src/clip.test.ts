// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ desktop: false, invoke: vi.fn() }));
vi.mock("./vault/disk", () => ({ isTauri: () => h.desktop }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));

import { htmlToClip, clipPage } from "./clip";

const para = (n: number) =>
  `<p>Paragraph ${n} of the article body talks about note-taking, spaced repetition and how people keep ` +
  `what they read. It is long enough that a reader-view extractor treats it as real content, not chrome.</p>`;

const PAGE = `<!doctype html>
<html><head>
  <title>How to Take Smart Notes | Example Blog</title>
  <meta name="author" content="Ada Lovelace">
  <script>window.stolen = document.cookie; alert("xss")</script>
  <style>.nav { color: red }</style>
</head><body>
  <nav class="nav"><a href="/">Home</a> | <a href="/about">About us</a> | <a href="/shop">Shop now</a></nav>
  <header><div class="site-name">Example Blog</div></header>
  <article>
    <h1>How to Take Smart Notes</h1>
    <p class="byline">By Ada Lovelace</p>
    ${para(1)}
    <h2>Why notes matter</h2>
    ${para(2)}
    <p>See <a href="/guides/zettelkasten">the Zettelkasten guide</a> and <a href="https://example.org/other">another site</a>.</p>
    <ul><li>First point</li><li>Second point</li></ul>
    <ol><li>Step one</li><li>Step two</li></ol>
    ${para(3)}
    <h3>Further reading</h3>
    ${para(4)}
    <script>document.write("injected")</script>
  </article>
  <footer>Copyright 2026 Example Blog. All rights reserved. Cookie settings.</footer>
</body></html>`;

describe("htmlToClip", () => {
  it("keeps headings, links (made absolute) and lists", () => {
    const { markdown } = htmlToClip(PAGE, "https://blog.example.com/posts/smart-notes");
    expect(markdown).toMatch(/^## Why notes matter$/m);
    expect(markdown).toMatch(/^### Further reading$/m);
    expect(markdown).toContain("[the Zettelkasten guide](https://blog.example.com/guides/zettelkasten)");
    expect(markdown).toContain("[another site](https://example.org/other)");
    expect(markdown).toMatch(/^- +First point$/m);
    expect(markdown).toMatch(/^- +Second point$/m);
    expect(markdown).toMatch(/^1\. +Step one$/m);
    expect(markdown).toContain("Paragraph 4 of the article body");
  });

  it("drops navigation, scripts, styles and the footer", () => {
    const { markdown } = htmlToClip(PAGE, "https://blog.example.com/posts/smart-notes");
    expect(markdown).not.toContain("Shop now");
    expect(markdown).not.toContain("About us");
    expect(markdown).not.toContain("alert");
    expect(markdown).not.toContain("stolen");
    expect(markdown).not.toContain("injected");
    expect(markdown).not.toContain("color: red");
    expect(markdown).not.toContain("All rights reserved");
  });

  it("finds the title and byline", () => {
    const clip = htmlToClip(PAGE, "https://blog.example.com/posts/smart-notes");
    expect(clip.title).toBe("How to Take Smart Notes");
    expect(clip.byline).toMatch(/Ada Lovelace/);
  });

  it("parsing never runs the page's scripts", () => {
    (window as unknown as { stolen?: string }).stolen = undefined;
    htmlToClip(PAGE, "https://blog.example.com/");
    expect((window as unknown as { stolen?: string }).stolen).toBeUndefined();
  });

  it("a page too short for reader view still gives its text", () => {
    const { markdown, title } = htmlToClip(
      "<html><head><title>Tiny</title></head><body><nav>Menu</nav><h1>Tiny page</h1><p>Just a line.</p><script>x()</script></body></html>",
      "https://tiny.example.com/",
    );
    expect(title).toBe("Tiny");
    expect(markdown).toContain("Just a line.");
    expect(markdown).not.toContain("x()");
  });
});

describe("clipPage", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    h.invoke.mockReset();
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("desktop: the page is fetched by Rust (fetch_page), never through a third party", async () => {
    h.desktop = true;
    h.invoke.mockResolvedValue({ final_url: "https://blog.example.com/posts/smart-notes", html: PAGE });
    const note = await clipPage("http://blog.example.com/p/1");
    expect(h.invoke).toHaveBeenCalledWith("fetch_page", { url: "http://blog.example.com/p/1" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(note.title).toBe("How to Take Smart Notes");
    // frontmatter: title, author and the URL the page really came from (after redirects)
    expect(note.body).toMatch(/^---\ntitle: How to Take Smart Notes\nauthor: .*Ada Lovelace.*\nsource: https:\/\/blog\.example\.com\/posts\/smart-notes\nclipped: \d{4}-\d{2}-\d{2}\n---\n/);
    expect(note.body).toContain("# How to Take Smart Notes");
    expect(note.body).toContain("## Why notes matter");
  });

  it("desktop: a refused fetch (e.g. a local address) surfaces Rust's message", async () => {
    h.desktop = true;
    h.invoke.mockRejectedValue("Refusing to fetch a local or private address: http://127.0.0.1/");
    await expect(clipPage("http://127.0.0.1/")).rejects.toThrow(/local or private/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("browser build: falls back to r.jina.ai", async () => {
    h.desktop = false;
    fetchSpy.mockResolvedValue(new Response("Title: Jina Page\n\nURL Source: x\n\nMarkdown Content:\nHello", { status: 200 }));
    const note = await clipPage("https://example.com/");
    expect(fetchSpy.mock.calls[0][0]).toBe("https://r.jina.ai/https://example.com/");
    expect(h.invoke).not.toHaveBeenCalled();
    expect(note.title).toBe("Jina Page");
    expect(note.body).toMatch(/^---\ntitle: Jina Page\nsource: https:\/\/example\.com\/\n/);
  });

  it("frontmatter values stay on one line", async () => {
    h.desktop = true;
    h.invoke.mockResolvedValue({
      final_url: "https://x.example.com/",
      html: "<html><head><title>Two\nlines\n---\ntitle: evil</title></head><body><p>Hi there.</p></body></html>",
    });
    const note = await clipPage("https://x.example.com/");
    const fm = note.body.split("\n---\n")[0];
    expect(fm.split("\n").filter((l) => l.startsWith("title:"))).toHaveLength(1);
  });
});
