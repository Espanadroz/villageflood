import type { KV } from './kv';
import { SubmitError, type OutboxItem } from './submit';

export interface FailedItem { item: OutboxItem; reason: string }
const PENDING = 'pending:';
const FAILED = 'failed:';

export function createOutbox(deps: { store: KV; send: (item: OutboxItem) => Promise<void> }) {
  const { store, send } = deps;
  const load = async <T,>(prefix: string): Promise<T[]> => {
    const ks = (await store.keys()).filter((k) => k.startsWith(prefix));
    const items = await Promise.all(ks.map((k) => store.get<T>(k)));
    return items.filter(Boolean) as T[];
  };

  let inflightPromise: Promise<{ sent: number; failed: number; stoppedOnRetry: boolean }> | null = null;
  let dirty = false;

  const doFlush = async (): Promise<{ sent: number; failed: number; stoppedOnRetry: boolean }> => {
    try {
      const result = { sent: 0, failed: 0, stoppedOnRetry: false };
      for (const item of await box.pending()) {
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
      // If dirty flag was set during this run, queue another run and merge results
      if (dirty) {
        dirty = false;
        const followUpResult = await doFlush();
        return {
          sent: result.sent + followUpResult.sent,
          failed: result.failed + followUpResult.failed,
          stoppedOnRetry: result.stoppedOnRetry || followUpResult.stoppedOnRetry
        };
      }
      return result;
    } finally {
      inflightPromise = null;
    }
  };

  const box = {
    add: (item: OutboxItem) => store.set(PENDING + item.id, item),
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
