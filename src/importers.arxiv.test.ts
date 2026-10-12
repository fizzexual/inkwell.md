// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { fetchSource } from "./importers";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <title>Attention Is
   All You Need</title>
  <published>2017-06-12T17:57:34Z</published>
  <summary>The dominant sequence transduction models...</summary>
  <author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author>
</entry></feed>`;

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  invoke.mockReset();
  vi.unstubAllGlobals();
});

describe("arXiv import in the desktop app", () => {
  it("goes through the Rust arxiv_query command (arXiv sends no CORS headers, so a webview fetch always fails)", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invoke.mockResolvedValue(FEED);
    const fetchSpy = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", fetchSpy);

    const item = await fetchSource("https://arxiv.org/abs/1706.03762v7");

    expect(invoke).toHaveBeenCalledWith("arxiv_query", { id: "1706.03762" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(item.title).toBe("Attention Is All You Need");
    expect(item.content).toContain("Ashish Vaswani, Noam Shazeer");
  });
});
