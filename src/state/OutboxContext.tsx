import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { outbox as realOutbox } from './outbox';

export interface OutboxStatus { pendingCount: number; failedCount: number; refresh(): Promise<void> }
type Box = { pending(): Promise<unknown[]>; failed(): Promise<unknown[]>; flush(): Promise<unknown> };

const Ctx = createContext<OutboxStatus>({ pendingCount: 0, failedCount: 0, refresh: async () => {} });
export const useOutboxStatus = () => useContext(Ctx);

export function OutboxProvider({ children, box = realOutbox, intervalMs = 15_000 }: { children: ReactNode; box?: Box; intervalMs?: number }) {
  const [pendingCount, setP] = useState(0);
  const [failedCount, setF] = useState(0);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([box.pending(), box.failed()]);
      if (alive.current) { setP(p.length); setF(f.length); }
    } catch (e) { console.warn('outbox refresh failed', e); }
  }, [box]);

  useEffect(() => {
    alive.current = true;
    const sync = async () => {
      try { await box.flush(); } catch (e) { console.warn('outbox flush failed', e); }
      await refresh();
    };
    sync();
    const t = setInterval(sync, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      clearInterval(t);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [box, refresh, intervalMs]);

  const value = useMemo(() => ({ pendingCount, failedCount, refresh }), [pendingCount, failedCount, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
