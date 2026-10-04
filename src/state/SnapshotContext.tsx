import { createContext, useCallback, useRef, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchSnapshot } from '../data/queries';
import type { Snapshot } from '../data/types';
import { readCache, writeCache } from '../data/cache';
import { effectiveNow } from '../data/clock';


interface Ctx { snapshot: Snapshot | null; error: Error | null; loading: boolean; reload(): void; now: number }
const DataContext = createContext<Ctx | null>(null);

export function SnapshotProvider({ children, refreshMs = 60_000 }: { children: ReactNode; refreshMs?: number }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(readCache);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const verified = useRef(false);
  const [tick, setTick] = useState(Date.now());

  const load = useCallback(async () => {
    try { const s = await fetchSnapshot(); verified.current = true; setSnapshot(s); setError(null); writeCache(s); }
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
  const now = effectiveNow(tick, snapshot?.serverOffsetMs ?? 0, verified.current);
  const value = useMemo(() => ({ snapshot, error, loading, reload: load, now }), [snapshot, error, loading, load, now]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <SnapshotProvider>');
  return ctx;
}
