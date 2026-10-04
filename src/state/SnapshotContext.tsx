import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchSnapshot } from '../data/queries';
import type { Snapshot } from '../data/types';

const CACHE_KEY = 'flood.snapshot.v1';
const readCache = (): Snapshot | null => { try { const s = localStorage.getItem(CACHE_KEY); return s ? (JSON.parse(s) as Snapshot) : null; } catch { return null; } };
const writeCache = (s: Snapshot) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* quota or blocked: ignore */ } };

interface Ctx { snapshot: Snapshot | null; error: Error | null; loading: boolean; reload(): void; now: number }
const DataContext = createContext<Ctx | null>(null);

export function SnapshotProvider({ children, refreshMs = 60_000 }: { children: ReactNode; refreshMs?: number }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(readCache);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(Date.now());

  const load = useCallback(async () => {
    try { const s = await fetchSnapshot(); setSnapshot(s); setError(null); writeCache(s); }
    catch (e) { setError(e as Error); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, refreshMs);
    const clock = setInterval(() => setTick(Date.now()), 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') { setTick(Date.now()); load(); } };
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(refresh); clearInterval(clock); window.removeEventListener('online', load); document.removeEventListener('visibilitychange', onVisible); };
  }, [load, refreshMs]);

  // `now` is corrected by the server clock offset so a wrong phone clock cannot make old data look fresh.
  const now = tick + (snapshot?.serverOffsetMs ?? 0);
  const value = useMemo(() => ({ snapshot, error, loading, reload: load, now }), [snapshot, error, loading, load, now]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <SnapshotProvider>');
  return ctx;
}
