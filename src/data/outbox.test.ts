import { createOutbox } from './outbox';
import { memoryKV } from './kv';
import { SubmitError, type OutboxItem } from './submit';

// Small createdAt values (< 1000) are ordering offsets from the test start, so these items stay within the TTL.
const BASE = Date.now();
const item = (id: string, createdAt: number): OutboxItem => ({
  id, createdAt: createdAt < 1000 ? BASE + createdAt : createdAt, attempts: 0, blob: null, mediaType: null,
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

const tick = () => new Promise((r) => setTimeout(r, 5));

it('(d) flush() during a follow-up pass never starts a concurrent run', async () => {
  let active = 0, maxActive = 0;
  const sendCounts: Record<string, number> = {};
  const gates: Record<string, () => void> = {};
  const box = createOutbox({
    store: memoryKV(),
    send: async (i) => {
      active++; maxActive = Math.max(maxActive, active);
      sendCounts[i.id] = (sendCounts[i.id] ?? 0) + 1;
      await new Promise<void>((r) => { gates[i.id] = r; });
      active--;
    },
  });
  await box.add(item('a', 1));
  const p1 = box.flush();
  await tick();
  await box.add(item('b', 2));
  expect(box.flush()).toBe(p1); // sets dirty
  gates['a']!(); // first pass done -> follow-up pass starts, sending b
  await tick();
  expect(gates['b']).toBeDefined(); // follow-up pass active
  await box.add(item('c', 3));
  const p3 = box.flush(); // during follow-up pass
  expect(p3).toBe(p1);
  await tick();
  gates['b']!();
  await tick();
  expect(box.flush()).toBe(p1); // during the third pass too
  gates['c']!();
  const result = await p1;
  expect(maxActive).toBe(1);
  expect(sendCounts).toEqual({ a: 1, b: 1, c: 1 });
  expect(result.sent).toBe(3);
  expect(await box.pending()).toHaveLength(0);
});
it('(e) a run that throws leaves no stale dirty: next flush does exactly one pass', async () => {
  const base = memoryKV();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let throwOnce = false;
  let sendCalls = 0;
  const box = createOutbox({
    store: { ...base, set: async (k, v) => { if (throwOnce) { throwOnce = false; throw new Error('boom'); } return base.set(k, v); } },
    send: async () => { sendCalls++; if (sendCalls === 1) await gate; throw new SubmitError('offline', true); },
  });
  await box.add(item('a', 1));
  const p1 = box.flush();
  await tick();
  box.flush(); // dirty = true
  throwOnce = true; // retryable path's store.set rejects
  release();
  await expect(p1).rejects.toThrow('boom');
  sendCalls = 100;
  const r = await box.flush();
  expect(sendCalls).toBe(101); // exactly one pass for the single pending item
  expect(r.stoppedOnRetry).toBe(true);
});
it('(f) retryable pass with dirty set does not loop again', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let sendCalls = 0;
  const box = createOutbox({
    store: memoryKV(),
    send: async () => { sendCalls++; await gate; throw new SubmitError('offline', true); },
  });
  await box.add(item('a', 1));
  const p1 = box.flush();
  await tick();
  box.flush(); // dirty
  release();
  const r = await p1;
  expect(sendCalls).toBe(1);
  expect(r).toEqual({ sent: 0, failed: 0, stoppedOnRetry: true });
});

describe('observation age and location hold', () => {
  const H = 3_600_000;
  it('moves an item older than its kind TTL to failed as report_too_old without sending it', async () => {
    const sent: string[] = [];
    const now = 10 * 24 * H;
    const box = createOutbox({ store: memoryKV(), send: async (i) => { sent.push(i.id); }, now: () => now });
    await box.add(item('old', now - 3 * H - 1000));
    await box.add(item('fresh', now - H));
    expect(await box.flush()).toEqual({ sent: 1, failed: 1, stoppedOnRetry: false });
    expect(sent).toEqual(['fresh']);
    const failed = await box.failed();
    expect(failed.map((f) => [f.item.id, f.reason])).toEqual([['old', 'report_too_old']]);
  });
  it('uses the per-kind TTL (water 2 h, supply 12 h, general never)', async () => {
    const now = 10 * 24 * H;
    const box = createOutbox({ store: memoryKV(), send: async () => {}, now: () => now });
    const k = (id: string, kind: OutboxItem['draft']['kind'], age: number) => ({ ...item(id, now - age), draft: { ...item(id, 0).draft, kind } });
    await box.add(k('w', 'water_level', 2 * H + 1000));
    await box.add(k('s', 'supply', 11 * H));
    await box.add(k('g', 'general', 30 * H));
    const r = await box.flush();
    expect(r).toEqual({ sent: 2, failed: 1, stoppedOnRetry: false });
    expect((await box.failed()).map((f) => f.item.id)).toEqual(['w']);
  });
  it('skips held items without failing them or stopping the run', async () => {
    const sent: string[] = [];
    const now = 1_000_000;
    const box = createOutbox({ store: memoryKV(), send: async (i) => { sent.push(i.id); }, now: () => now });
    await box.add({ ...item('held', now - 10), holdUntil: now + 5000 });
    await box.add(item('next', now - 5));
    expect(await box.flush()).toEqual({ sent: 1, failed: 0, stoppedOnRetry: false });
    expect(sent).toEqual(['next']);
    expect((await box.pending()).map((p) => p.id)).toEqual(['held']);
    expect(await box.failed()).toHaveLength(0);
  });
  it('sends a held item once its holdUntil has passed (tab closed during the location wait)', async () => {
    const sent: OutboxItem[] = [];
    let now = 1_000_000;
    const box = createOutbox({ store: memoryKV(), send: async (i) => { sent.push(i); }, now: () => now });
    await box.add({ ...item('held', now), holdUntil: now + 8000 });
    await box.flush();
    expect(sent).toHaveLength(0);
    now += 8001;
    await box.flush();
    expect(sent.map((s) => s.id)).toEqual(['held']);
    expect(sent[0]!.draft.lat).toBeNull();
  });
  it('update() patches a pending item; flushing then sends the coordinates', async () => {
    const sent: OutboxItem[] = [];
    const now = 1_000_000;
    const box = createOutbox({ store: memoryKV(), send: async (i) => { sent.push(i); }, now: () => now });
    const it0 = { ...item('a', now), holdUntil: now + 8000 };
    await box.add(it0);
    expect(await box.update('a', { draft: { ...it0.draft, lat: 13.7, lng: 100.7 }, holdUntil: 0 })).toBe(true);
    await box.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.draft).toMatchObject({ lat: 13.7, lng: 100.7 });
  });
  it('update() ignores unknown or already-sent items and never resurrects them', async () => {
    const box = createOutbox({ store: memoryKV(), send: async () => {} });
    expect(await box.update('nope', { holdUntil: 0 })).toBe(false);
    await box.add(item('a', Date.now()));
    await box.flush();
    expect(await box.update('a', { holdUntil: 0 })).toBe(false);
    expect(await box.pending()).toHaveLength(0);
  });
  it('update() cannot change the id', async () => {
    const box = createOutbox({ store: memoryKV(), send: async () => {} });
    await box.add(item('a', 1));
    await box.update('a', { id: 'b' } as never);
    expect((await box.pending()).map((p) => p.id)).toEqual(['a']);
  });
});
