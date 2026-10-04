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
  return {
    add: (item: OutboxItem) => store.set(PENDING + item.id, item),
    async pending(): Promise<OutboxItem[]> {
      return (await load<OutboxItem>(PENDING)).sort((a, b) => a.createdAt - b.createdAt);
    },
    failed: () => load<FailedItem>(FAILED),
    dismissFailed: (id: string) => store.del(FAILED + id),
    async flush(): Promise<{ sent: number; failed: number; stoppedOnRetry: boolean }> {
      const result = { sent: 0, failed: 0, stoppedOnRetry: false };
      for (const item of await this.pending()) {
        try {
          await send(item);
          await store.del(PENDING + item.id);
          result.sent++;
        } catch (e) {
          const err = e instanceof SubmitError ? e : new SubmitError((e as Error).message, false);
          if (err.retryable) {
            await store.set(PENDING + item.id, { ...item, attempts: item.attempts + 1 });
            result.stoppedOnRetry = true;
            break; // offline: don't hammer the rest
          }
          await store.set(FAILED + item.id, { item, reason: err.message } satisfies FailedItem);
          await store.del(PENDING + item.id);
          result.failed++;
        }
      }
      return result;
    },
  };
}
