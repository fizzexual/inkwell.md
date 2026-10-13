import { describe, expect, it } from "vitest";
import { runOfflineChat, type OfflineDeps } from "./chat";
import type { ChatTurn } from "./prompt";

const notes = [
  { id: "1", title: "Project Falcon", content: "# Project Falcon\nCut-over: 14 November 2026. Owner: Dana." },
  { id: "2", title: "Sourdough log", content: "78% hydration, 250 C." },
  { id: "3", title: "Shopping", content: "milk, eggs" },
];

function deps(over: Partial<OfflineDeps> = {}): OfflineDeps & { prompts: ChatTurn[][] } {
  const prompts: ChatTurn[][] = [];
  return {
    prompts,
    notes,
    search: async () => [
      { id: "1", score: 0.9 },
      { id: "2", score: 0.5 },
    ],
    generate: async (messages, onToken) => {
      prompts.push(messages);
      for (const t of ["On 14 November", " — [[Project Falcon]]."]) onToken(t);
      return { text: "On 14 November — [[Project Falcon]].", tokens: 9, aborted: false };
    },
    ...over,
  };
}

describe("offline chat (single-shot RAG)", () => {
  it("puts the notes local search found into the prompt, best first, and streams the answer", async () => {
    const d = deps();
    const streamed: string[] = [];
    const out = await runOfflineChat("When is the cut-over?", [], d, (t) => streamed.push(t));
    const user = d.prompts[0][d.prompts[0].length - 1].content;
    expect(user).toContain('<note title="Project Falcon">');
    expect(user).toContain('<note title="Sourdough log">');
    expect(user).not.toContain("Shopping");
    expect(user.indexOf("Project Falcon")).toBeLessThan(user.indexOf("Sourdough log"));
    expect(streamed.join("")).toBe("On 14 November — [[Project Falcon]].");
    expect(out.text.startsWith("On 14 November — [[Project Falcon]].")).toBe(true);
  });

  it("always ends with clickable [[links]] to the notes it was given", async () => {
    const out = await runOfflineChat("q", [], deps());
    expect(out.text).toMatch(/\[\[Project Falcon\]\].*\[\[Sourdough log\]\]\s*$/s);
    expect(out.sources).toEqual(["Project Falcon", "Sourdough log"]);
  });

  it("weak semantic matches are left out instead of padding the prompt", async () => {
    const d = deps({ search: async () => [{ id: "1", score: 0.6 }, { id: "3", score: 0.05 }] });
    const out = await runOfflineChat("q", [], d);
    expect(out.sources).toEqual(["Project Falcon"]);
  });

  it("falls back to keyword search when the semantic index can't be used", async () => {
    const d = deps({ search: async () => { throw new Error("embedding model missing"); } });
    const out = await runOfflineChat("what do I need from shopping? milk", [], d);
    expect(out.sources[0]).toBe("Shopping");
  });

  it("Stop keeps the partial answer and adds no source footer to a cut-off reply", async () => {
    const d = deps({
      generate: async (_m, onToken) => {
        onToken("On 14");
        return { text: "On 14", tokens: 2, aborted: true };
      },
    });
    const out = await runOfflineChat("q", [], d);
    expect(out).toMatchObject({ text: "On 14", aborted: true });
  });

  it("drops a thinking block if the model emits one", async () => {
    const d = deps({
      generate: async () => ({ text: "<think>\nhmm\n</think>\n\nOn 14 November.", tokens: 5, aborted: false }),
    });
    const out = await runOfflineChat("q", [], d);
    expect(out.text.startsWith("On 14 November.")).toBe(true);
  });
});
