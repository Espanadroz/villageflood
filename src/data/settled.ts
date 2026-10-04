/** Optional tables: a failure (or non-array) yields [] instead of failing the whole snapshot. */
export async function settledOrEmpty<T>(p: PromiseLike<T[]>): Promise<T[]> {
  try { const r = await p; return Array.isArray(r) ? r : []; } catch { return []; }
}
