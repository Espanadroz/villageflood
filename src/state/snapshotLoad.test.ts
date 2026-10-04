import { afterEach, expect, it, vi } from 'vitest';
import { createLatestGate, FETCH_TIMEOUT_MS, TIMEOUT_MESSAGE_TH, withTimeout } from './snapshotLoad';

afterEach(() => vi.useRealTimers());

it('uses a 20 s timeout', () => expect(FETCH_TIMEOUT_MS).toBe(20_000));

it('resolves when the promise settles in time', async () => {
  await expect(withTimeout(Promise.resolve(5), 1000)).resolves.toBe(5);
  await expect(withTimeout(Promise.reject(new Error('x')), 1000)).rejects.toThrow('x');
});
it('rejects with a Thai message after the timeout', async () => {
  vi.useFakeTimers();
  const p = withTimeout(new Promise(() => {}), 20_000);
  const check = expect(p).rejects.toThrow(TIMEOUT_MESSAGE_TH);
  await vi.advanceTimersByTimeAsync(20_001);
  await check;
  expect(TIMEOUT_MESSAGE_TH).toMatch(/[ก-๙]/);
});
it('clears its timer when the promise settles first', async () => {
  vi.useFakeTimers();
  const clear = vi.spyOn(globalThis, 'clearTimeout');
  await withTimeout(Promise.resolve(1), 20_000);
  expect(clear).toHaveBeenCalled();
});

it('applies responses in order and ignores an older response arriving after a newer one', () => {
  const g = createLatestGate();
  const a = g.begin(); const b = g.begin();
  expect(g.shouldApply(b)).toBe(true);   // newer arrives first
  expect(g.shouldApply(a)).toBe(false);  // stale: ignored
  const c = g.begin();
  expect(g.shouldApply(c)).toBe(true);
});
it('applies each in-order response', () => {
  const g = createLatestGate();
  const a = g.begin(); expect(g.shouldApply(a)).toBe(true);
  const b = g.begin(); expect(g.shouldApply(b)).toBe(true);
  expect(g.shouldApply(b)).toBe(false); // the same response twice is not re-applied
});
