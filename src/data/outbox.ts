import type { KV } from './kv';
import { isTooOld, SubmitError, type OutboxItem } from './submit';

export interface FailedItem { item: OutboxItem; reason: string }
const PENDING = 'pending:';
const FAILED = 'failed:';

export type OutboxPatch = Partial<Pick<OutboxItem, 'draft' | 'holdUntil'>>;

export function createOutbox(deps: { store: KV; send: (item: OutboxItem) => Promise<void>; now?: () => number }) {
  const { store, send } = deps;
  const now = deps.now ?? Date.now;
  const load = async <T,>(prefix: string): Promise<T[]> => {
    const ks = (await store.keys()).filter((k) => k.startsWith(prefix));
    const items = await Promise.all(ks.map((k) => store.get<T>(k)));
    return items.filter(Boolean) as T[];
  };

  let inflightPromise: Promise<{ sent: number; failed: number; stoppedOnRetry: boolean }> | null = null;
  let dirty = false;

  type FlushResult = { sent: number; failed: number; stoppedOnRetry: boolean };

  const runOnce = async (): Promise<FlushResult> => {
    const result: FlushResult = { sent: 0, failed: 0, stoppedOnRetry: false };
    for (const item of await box.pending()) {
      const t = now();
      // waiting for a location fix: not sent, not failed, does not stop the run
      if (typeof item.holdUntil === 'number' && item.holdUntil > t) continue;
      // an expired observation must never be delivered as current: keep it visible as failed instead
      if (isTooOld(item, t)) {
        await store.set(FAILED + item.id, { item, reason: 'report_too_old' } satisfies FailedItem);
        await store.del(PENDING + item.id);
        result.failed++;
        continue;
      }
      let sendErr: Error | null = null;
      try {
        await send(item);
      } catch (e) {
        sendErr = e as Error;
      }

      if (sendErr) {
        const err = sendErr instanceof SubmitError ? sendErr : new SubmitError(sendErr.message, false);
        if (err.retryable) {
          await store.set(PENDING + item.id, { ...item, attempts: item.attempts + 1 });
          result.stoppedOnRetry = true;
          break;
        }
        await store.set(FAILED + item.id, { item, reason: err.message } satisfies FailedItem);
        await store.del(PENDING + item.id);
        result.failed++;
      } else {
        await store.del(PENDING + item.id);
        result.sent++;
      }
    }
    return result;
  };

  // Single loop (no recursion): at most one run at a time; flush() during a run sets `dirty`
  // to request another pass over the new snapshot. State is cleared once, in one finally.
  const doFlush = async (): Promise<FlushResult> => {
    const total: FlushResult = { sent: 0, failed: 0, stoppedOnRetry: false };
    try {
      do {
        dirty = false;
        const r = await runOnce();
        total.sent += r.sent;
        total.failed += r.failed;
        total.stoppedOnRetry = total.stoppedOnRetry || r.stoppedOnRetry;
        if (r.stoppedOnRetry) break; // don't hammer a retryable failure; next trigger retries
      } while (dirty);
      return total;
    } finally {
      inflightPromise = null;
      dirty = false;
    }
  };

  const box = {
    add: (item: OutboxItem) => store.set(PENDING + item.id, item),
    /** Patch a still-pending item (e.g. add coordinates, release the hold). Returns false if it is no longer pending. */
    async update(id: string, patch: OutboxPatch): Promise<boolean> {
      const cur = await store.get<OutboxItem>(PENDING + id);
      if (!cur) return false;
      const next: OutboxItem = { ...cur, id: cur.id };
      if (patch.draft) next.draft = patch.draft;
      if ('holdUntil' in patch) next.holdUntil = patch.holdUntil;
      await store.set(PENDING + id, next);
      return true;
    },
    async pending(): Promise<OutboxItem[]> {
      return (await load<OutboxItem>(PENDING)).sort((a, b) => a.createdAt - b.createdAt);
    },
    failed: () => load<FailedItem>(FAILED),
    dismissFailed: (id: string) => store.del(FAILED + id),
    async retryFailed(id: string): Promise<void> {
      const failed = await this.failed();
      const item = failed.find((f) => f.item.id === id);
      if (!item) return;
      await store.set(PENDING + id, { ...item.item, attempts: 0 });
      await store.del(FAILED + id);
    },
    flush(): Promise<{ sent: number; failed: number; stoppedOnRetry: boolean }> {
      if (inflightPromise) {
        dirty = true;
        return inflightPromise;
      }
      inflightPromise = doFlush();
      return inflightPromise;
    },
  };

  return box;
}
