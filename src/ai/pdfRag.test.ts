// @vitest-environment jsdom
// The chat's local RAG hands the agent PDF passages it can cite as `[p. N](#/pdf/…)` links.
import { afterEach, describe, expect, it, vi } from "vitest";
import { pdfPassagesPrompt, runVaultAgent, toPdfHits, type VaultAccess } from "./agent";
import { renderAnswer } from "./renderAnswer";
import { parsePdfHref } from "../pdfLinks";
import type { Provider } from "./providers";

const hits = [
  { id: "note-a", score: 0.9 },
  {
    id: "pdf:Attachments/My paper.pdf#3.0",
    score: 0.8,
    pdf: { rel: "Attachments/My paper.pdf", page: 3, text: "We report BLEU scores for every system." },
  },
];

describe("PDF passages in the chat's RAG", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps only PDF hits, each with a working in-app link to its page", () => {
    const pdf = toPdfHits(hits);
    expect(pdf).toHaveLength(1);
    expect(pdf[0]).toMatchObject({ name: "My paper.pdf", page: 3 });
    expect(parsePdfHref(pdf[0].href)).toEqual({ rel: "Attachments/My paper.pdf", page: 3 });
  });

  it("the prompt quotes the passage and the exact citation to use", () => {
    const text = pdfPassagesPrompt(toPdfHits(hits));
    expect(text).toContain("My paper.pdf, p. 3");
    expect(text).toContain("We report BLEU scores");
    expect(text).toContain("[p. 3](#/pdf/Attachments/My%20paper.pdf?page=3)");
    expect(pdfPassagesPrompt([])).toBe("");
  });

  it("the agent's system prompt carries the PDF passages", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const vault: VaultAccess = {
      notes: [],
      resolve: () => undefined,
      getNote: () => undefined,
      linksOf: () => [],
      backlinksOf: () => [],
      pdfHits: toPdfHits(hits),
    };
    const provider = { id: "anthropic", kind: "anthropic", label: "Claude", baseUrl: "https://x.test/v1" } as Provider;
    await runVaultAgent({ provider, apiKey: "test", model: "m", messages: [{ role: "user", content: "q" }], vault, onStep: () => {} });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.system[0].text).toContain("[p. 3](#/pdf/Attachments/My%20paper.pdf?page=3)");
  });

  it("a cited page survives rendering as a clickable in-app link", () => {
    const el = document.createElement("div");
    el.innerHTML = renderAnswer("BLEU is used [p. 3](#/pdf/Attachments/My%20paper.pdf?page=3).");
    expect(el.querySelector("a")?.getAttribute("href")).toBe("#/pdf/Attachments/My%20paper.pdf?page=3");
  });
});
