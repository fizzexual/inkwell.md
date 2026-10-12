// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain node script, no type declarations
import { planDownloads, verifyBytes, fetchModels, remoteUrl } from "./fetch-models.mjs";
import manifest from "../src/ml/models.json";

const HELLO = new TextEncoder().encode("hello\n");
const HELLO_SHA256 = "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03";
const HELLO_GIT_SHA1 = "ce013625030ba8dba906f756967f9e9ca394464a";

const tiny = {
  m: {
    id: "Org/tiny",
    revision: "abc123",
    dtype: "q8",
    files: [
      { path: "config.json", size: 6, gitSha1: HELLO_GIT_SHA1 },
      { path: "onnx/model_quantized.onnx", size: 6, sha256: HELLO_SHA256 },
    ],
  },
};

const tmp = () => mkdtempSync(join(tmpdir(), "inkwell-models-"));

describe("model manifest", () => {
  it("pins every model to a commit and gives every file a size and exactly one hash", () => {
    for (const m of Object.values(manifest)) {
      expect(m.revision).toMatch(/^[0-9a-f]{40}$/);
      for (const f of m.files as { size: number; sha256?: string; gitSha1?: string }[]) {
        expect(f.size).toBeGreaterThan(0);
        expect(!!f.sha256 !== !!f.gitSha1).toBe(true);
      }
    }
  });
});

describe("verifyBytes", () => {
  it("accepts the right size + sha256 and the right size + git blob sha1", () => {
    expect(verifyBytes(HELLO, { path: "a", size: 6, sha256: HELLO_SHA256 })).toBeNull();
    expect(verifyBytes(HELLO, { path: "a", size: 6, gitSha1: HELLO_GIT_SHA1 })).toBeNull();
  });
  it("rejects a wrong size or a wrong hash", () => {
    expect(verifyBytes(HELLO, { path: "a", size: 7, sha256: HELLO_SHA256 })).toMatch(/size/);
    expect(verifyBytes(HELLO, { path: "a", size: 6, sha256: "0".repeat(64) })).toMatch(/sha256/);
    expect(verifyBytes(HELLO, { path: "a", size: 6, gitSha1: "0".repeat(40) })).toMatch(/sha1/);
  });
});

describe("planDownloads", () => {
  it("skips files already present with the right size, fetches missing and wrong-size ones", () => {
    const root = tmp();
    mkdirSync(join(root, "Org", "tiny"), { recursive: true });
    writeFileSync(join(root, "Org", "tiny", "config.json"), "hello\n"); // right size
    const plan = planDownloads(tiny, root);
    expect(plan.map((p: { file: { path: string } }) => p.file.path)).toEqual(["onnx/model_quantized.onnx"]);

    writeFileSync(join(root, "Org", "tiny", "config.json"), "truncated"); // wrong size
    expect(planDownloads(tiny, root)).toHaveLength(2);
  });

  it("downloads from the pinned revision", () => {
    expect(remoteUrl(tiny.m, tiny.m.files[1])).toBe(
      "https://huggingface.co/Org/tiny/resolve/abc123/onnx/model_quantized.onnx",
    );
  });
});

describe("fetchModels", () => {
  it("downloads what is missing once, then does nothing (idempotent)", async () => {
    const root = tmp();
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      return new Response(HELLO);
    };
    const first = await fetchModels({ manifest: tiny, root, fetchFn, log: () => {} });
    expect(first.downloaded).toBe(2);
    expect(readFileSync(join(root, "Org", "tiny", "onnx", "model_quantized.onnx"), "utf8")).toBe("hello\n");
    const second = await fetchModels({ manifest: tiny, root, fetchFn, log: () => {} });
    expect(second.downloaded).toBe(0);
    expect(urls).toHaveLength(2);
  });

  it("refuses a corrupt download and leaves no file behind", async () => {
    const root = tmp();
    const fetchFn = async () => new Response("HELLO\n"); // right size, wrong bytes
    await expect(fetchModels({ manifest: tiny, root, fetchFn, log: () => {} })).rejects.toThrow(/sha1|sha256/);
    expect(existsSync(join(root, "Org", "tiny", "config.json"))).toBe(false);
  });

  it("fails on an HTTP error instead of writing the error page", async () => {
    const root = tmp();
    const fetchFn = async () => new Response("nope", { status: 404 });
    await expect(fetchModels({ manifest: tiny, root, fetchFn, log: () => {} })).rejects.toThrow(/404/);
    expect(existsSync(join(root, "Org", "tiny", "config.json"))).toBe(false);
  });
});
