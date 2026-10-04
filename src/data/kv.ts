import { createStore, del, get, keys, set } from 'idb-keyval';

export interface KV {
  get<T>(k: string): Promise<T | undefined>;
  set(k: string, v: unknown): Promise<void>;
  del(k: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function memoryKV(): KV {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async keys() { return [...m.keys()]; },
  };
}

/** IndexedDB so photo/video blobs survive a closed tab while offline. */
export function idbKV(): KV {
  const store = createStore('flood', 'outbox');
  return {
    get: <T,>(k: string) => get<T>(k, store),
    set: (k, v) => set(k, v, store),
    del: (k) => del(k, store),
    keys: async () => (await keys(store)).map(String),
  };
}
