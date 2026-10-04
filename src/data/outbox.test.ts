import { createOutbox } from './outbox';
import { memoryKV } from './kv';
import { SubmitError, type OutboxItem } from './submit';

const item = (id: string, createdAt: number): OutboxItem => ({
  id, createdAt, attempts: 0, blob: null, mediaType: null,
  draft: { deviceId: 'd', nickname: 'n', kind: 'road', targetId: 's', value: 'impassable', lat: null, lng: null, note: null },
});

it('removes an item after a successful send', async () => {
  const sent: string[] = [];
  const box = createOutbox({ store: memoryKV(), send: async (i) => { sent.push(i.id); } });
  await box.add(item('a', 1));
  expect(await box.flush()).toEqual({ sent: 1, failed: 0, stoppedOnRetry: false });
  expect(sent).toEqual(['a']);
  expect(await box.pending()).toHaveLength(0);
});
it('keeps the item and stops on a retryable error, preserving order', async () => {
  const tried: string[] = [];
  const box = createOutbox({ store: memoryKV(), send: async (i) => { tried.push(i.id); throw new SubmitError('offline', true); } });
  await box.add(item('b', 2)); await box.add(item('a', 1));
  const r = await box.flush();
  expect(r).toEqual({ sent: 0, failed: 0, stoppedOnRetry: true });
  expect(tried).toEqual(['a']);
  const pending = await box.pending();
  expect(pending.map((p) => p.id)).toEqual(['a', 'b']);
  expect(pending[0]!.attempts).toBe(1);
});
it('moves permanently failing items to the failed list and continues', async () => {
  const box = createOutbox({
    store: memoryKV(),
    send: async (i) => { if (i.id === 'bad') throw new SubmitError('invalid_value', false); },
  });
  await box.add(item('bad', 1)); await box.add(item('good', 2));
  expect(await box.flush()).toEqual({ sent: 1, failed: 1, stoppedOnRetry: false });
  expect((await box.failed()).map((f) => f.item.id)).toEqual(['bad']);
  await box.dismissFailed('bad');
  expect(await box.failed()).toHaveLength(0);
});
it('returns same promise for concurrent flush calls', async () => {
  const sent: string[] = [];
  const box = createOutbox({
    store: memoryKV(),
    send: async (i) => {
      sent.push(i.id);
      await new Promise(r => setTimeout(r, 10));
    }
  });
  await box.add(item('a', 1)); await box.add(item('b', 2));
  const p1 = box.flush();
  const p2 = box.flush();
  expect(p1).toBe(p2);
  await p1;
  expect(sent).toEqual(['a', 'b']);
});
it('retryFailed moves a failed item back to pending', async () => {
  const box = createOutbox({
    store: memoryKV(),
    send: async (i) => { if (i.id === 'bad') throw new SubmitError('invalid_value', false); },
  });
  await box.add(item('bad', 1));
  await box.flush();
  expect((await box.failed()).map((f) => f.item.id)).toEqual(['bad']);
  await box.retryFailed('bad');
  expect(await box.failed()).toHaveLength(0);
  const pending = await box.pending();
  expect(pending.map((p) => p.id)).toEqual(['bad']);
  expect(pending[0]!.attempts).toBe(0);
});
it('(a) store failure: rejected flush() is cleared in finally so later flush() works', async () => {
  const baseStore = memoryKV();
  let throwOnce = true;
  const box = createOutbox({
    store: {
      ...baseStore,
      del: async (k) => { if (throwOnce) { throwOnce = false; throw new Error('store error'); } return baseStore.del(k); }
    },
    send: async () => {}
  });
  await box.add(item('a', 1));
  const p1 = box.flush();
  await expect(p1).rejects.toThrow('store error');
  // inflight promise was cleared in finally (no endless loop), so a new flush can start
  // 'a' is still pending because del failed, so p2 will send both 'a' and 'b'
  await box.add(item('b', 2));
  const p2 = box.flush();
  expect(await p2).toEqual({ sent: 2, failed: 0, stoppedOnRetry: false });
});
it('(b) mid-run add with manual deferred: merged result has sent===2, items sent exactly once in order', async () => {
  let resolveWait: (() => void) | null = null;
  const waitDeferred = new Promise<void>((r) => { resolveWait = r; });
  const sendLog: string[] = [];
  const box = createOutbox({
    store: memoryKV(),
    send: async (i) => {
      sendLog.push(i.id);
      if (i.id === 'a') {
        await waitDeferred;
      }
    }
  });
  await box.add(item('a', 1));
  const p1 = box.flush();
  // While 'a' send is pending, add 'b' and call flush again
  await new Promise(r => setTimeout(r, 10));
  await box.add(item('b', 2));
  const p2 = box.flush();
  expect(p2).toBe(p1); // same promise: p2 sets dirty flag
  // Now resolve the deferred to let 'a' complete
  resolveWait!();
  const result = await p1;
  // Verify: both items sent in order, merged result
  expect(sendLog).toEqual(['a', 'b']);
  expect(result.sent).toBe(2); // proves follow-up run and summing
  expect(result.failed).toBe(0);
  expect(result.stoppedOnRetry).toBe(false);
});
it('(c) two simultaneous flush calls with one item: send called exactly once, result sent===1', async () => {
  let sendCount = 0;
  const box = createOutbox({
    store: memoryKV(),
    send: async (i) => {
      sendCount++;
    }
  });
  await box.add(item('x', 1));
  const p1 = box.flush();
  const p2 = box.flush();
  expect(p1).toBe(p2); // same promise
  const result = await p1;
  expect(sendCount).toBe(1); // send called exactly once
  expect(result.sent).toBe(1);
  expect(result.failed).toBe(0);
});
