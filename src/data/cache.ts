import type { Snapshot } from './types';

export const CACHE_KEY = 'flood.snapshot.v1';
const ARRAYS = ['segments', 'marks', 'places', 'destinations', 'routes', 'reports', 'feed', 'latest', 'recent', 'warnings', 'incidents'] as const;

export function parseCachedSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || o.v !== 1 || !o.snapshot || typeof o.snapshot !== 'object') return null;
    const s = o.snapshot;
    if (!ARRAYS.every((k) => Array.isArray(s[k]))) return null;
    if (!s.settings || typeof s.settings !== 'object') return null;
    if (typeof s.serverOffsetMs !== 'number' || !Number.isFinite(s.serverOffsetMs)) return null;
    if (typeof s.fetchedAt !== 'number' || !Number.isFinite(s.fetchedAt)) return null;
    if (typeof s.statusTruncated !== 'boolean') return null;
    return s as Snapshot;
  } catch { return null; }
}

export function readCache(): Snapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const s = parseCachedSnapshot(raw);
    if (!s && raw) { try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ } }
    return s;
  } catch { return null; }
}
export function writeCache(snapshot: Snapshot): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 1, snapshot })); } catch { /* quota or blocked: ignore */ }
}
