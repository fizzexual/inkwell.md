// The semantic index on disk (IndexedDB), so a restart doesn't re-embed the whole vault: one
// record per note id with the hash of the text that was embedded and its vector. Records carry
// the model key; opening the store with a different model (or model version) deletes them all.
// Any IndexedDB failure degrades to "nothing cached" — search keeps working in memory.

export interface StoredVector {
  hash: number;
  vec: Float32Array;
}

export interface VectorStore {
  /** Every stored vector for this model (and deletes those of any other model). */
  loadAll(): Promise<Map<string, StoredVector>>;
  put(id: string, v: StoredVector): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

interface Row extends StoredVector {
  id: string;
  model: string;
}

const STORE = "vectors";

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });

export function openVectorStore(
  modelKey: string,
  { idb = globalThis.indexedDB as IDBFactory | undefined, dbName = "inkwell-semantic" } = {},
): VectorStore {
  let dbp: Promise<IDBDatabase | null> | null = null;
  const db = () =>
    (dbp ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        if (!idb) return resolve(null);
        const req = idb.open(dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
        req.onsuccess = () => {
          const d = req.result;
          d.onversionchange = () => d.close(); // let a future schema upgrade / delete through
          resolve(d);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));

  // run a write; a failure only costs us the cache, never the search
  const write = async (f: (s: IDBObjectStore) => void) => {
    try {
      const d = await db();
      if (!d) return;
      const tx = d.transaction(STORE, "readwrite");
      f(tx.objectStore(STORE));
      await done(tx);
    } catch {
      /* not cached — fine */
    }
  };

  return {
    async loadAll() {
      const out = new Map<string, StoredVector>();
      try {
        const d = await db();
        if (!d) return out;
        const tx = d.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return;
          const row = cur.value as Row;
          if (row.model === modelKey && row.vec instanceof Float32Array) {
            out.set(row.id, { hash: row.hash, vec: row.vec });
          } else cur.delete(); // another model's vector is meaningless here
          cur.continue();
        };
        await done(tx);
      } catch {
        out.clear();
      }
      return out;
    },

    put: (id, { hash, vec }) => write((s) => s.put({ id, model: modelKey, hash, vec } satisfies Row)),

    remove: (ids) => (ids.length ? write((s) => ids.forEach((id) => s.delete(id))) : Promise.resolve()),
  };
}
