import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FailedItem } from '../data/outbox';
import { outbox as realOutbox } from './outbox';

export interface OutboxStatus {
  pendingCount: number; failedCount: number;
  /** Every permanently failed report, so none is silently hidden. */
  failed: FailedItem[];
  refresh(): Promise<void>;
  /** Move a failed item back to the queue and try to send it now. Rejects on storage errors. */
  retry(id: string): Promise<void>;
  /** Remove a failed item from this device. Rejects on storage errors. */
  dismiss(id: string): Promise<void>;
}
type Box = {
  pending(): Promise<unknown[]>; failed(): Promise<FailedItem[]>; flush(): Promise<unknown>;
  retryFailed(id: string): Promise<void>; dismissFailed(id: string): Promise<void>;
};

const Ctx = createContext<OutboxStatus>({
  pendingCount: 0, failedCount: 0, failed: [], refresh: async () => {}, retry: async () => {}, dismiss: async () => {},
});
export const useOutboxStatus = () => useContext(Ctx);

export function OutboxProvider({ children, box = realOutbox, intervalMs = 15_000 }: { children: ReactNode; box?: Box; intervalMs?: number }) {
  const [pendingCount, setP] = useState(0);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([box.pending(), box.failed()]);
      if (alive.current) { setP(p.length); setFailed(f.slice().sort((a, b) => (a.item?.createdAt ?? 0) - (b.item?.createdAt ?? 0))); }
    } catch (e) { console.warn('outbox refresh failed', e); }
  }, [box]);

  const retry = useCallback(async (id: string) => {
    try {
      await box.retryFailed(id);
      try { await box.flush(); } catch (e) { console.warn('outbox flush failed', e); } // still queued: retried automatically
    } finally { await refresh(); }
  }, [box, refresh]);

  const dismiss = useCallback(async (id: string) => {
    try { await box.dismissFailed(id); } finally { await refresh(); }
  }, [box, refresh]);

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

  const value = useMemo(() => ({ pendingCount, failedCount: failed.length, failed, refresh, retry, dismiss }),
    [pendingCount, failed, refresh, retry, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
