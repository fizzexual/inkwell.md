import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openVectorStore } from "./vectorStore";

const v = (...xs: number[]) => new Float32Array(xs);

describe("persisted semantic index (IndexedDB)", () => {
  it("vectors written in one session are there after a restart", async () => {
    const idb = new IDBFactory();
    const a = openVectorStore("model-A", { idb });
    await a.put("n1", { hash: 11, vec: v(1, 0) });
    await a.put("n2", { hash: 22, vec: v(0, 1) });

    const after = await openVectorStore("model-A", { idb }).loadAll(); // fresh handle = new launch
    expect([...after.keys()].sort()).toEqual(["n1", "n2"]);
    expect(after.get("n1")).toEqual({ hash: 11, vec: v(1, 0) });
    expect(after.get("n2")!.vec).toBeInstanceOf(Float32Array);
  });

  it("a different model (or version) sees nothing, and the old model's vectors are dropped", async () => {
    const idb = new IDBFactory();
    await openVectorStore("model-A", { idb }).put("n1", { hash: 1, vec: v(1) });

    expect((await openVectorStore("model-B", { idb }).loadAll()).size).toBe(0);
    // they were deleted, not just hidden: going back to A finds nothing either
    expect((await openVectorStore("model-A", { idb }).loadAll()).size).toBe(0);
  });

  it("put overwrites a note's vector; remove deletes notes that no longer exist", async () => {
    const idb = new IDBFactory();
    const s = openVectorStore("m", { idb });
    await s.put("n1", { hash: 1, vec: v(1) });
    await s.put("n1", { hash: 2, vec: v(2) });
    await s.put("n2", { hash: 3, vec: v(3) });
    await s.remove(["n2", "never-existed"]);
    const all = await openVectorStore("m", { idb }).loadAll();
    expect([...all.entries()]).toEqual([["n1", { hash: 2, vec: v(2) }]]);
  });

  it("without IndexedDB it degrades to an empty, write-nothing store instead of throwing", async () => {
    const s = openVectorStore("m", { idb: undefined });
    await expect(s.put("n1", { hash: 1, vec: v(1) })).resolves.toBeUndefined();
    await expect(s.remove(["n1"])).resolves.toBeUndefined();
    expect((await s.loadAll()).size).toBe(0);
  });

  it("a database that fails to open behaves like no database (search still works in memory)", async () => {
    const broken = {
      open() {
        throw new Error("SecurityError: storage disabled");
      },
    } as unknown as IDBFactory;
    const s = openVectorStore("m", { idb: broken });
    await expect(s.put("n1", { hash: 1, vec: v(1) })).resolves.toBeUndefined();
    expect((await s.loadAll()).size).toBe(0);
  });
});
