import { afterEach, expect, it, vi } from 'vitest';
import { getPositionNow } from './useGeolocation';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const stub = (geo: unknown) => vi.stubGlobal('navigator', { geolocation: geo });

it('resolves a position on success', async () => {
  stub({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } }) });
  expect(await getPositionNow()).toEqual({ lat: 1, lng: 2, accuracy: 5 });
});
it('resolves null on error', async () => {
  stub({ getCurrentPosition: (_: unknown, err: (e: unknown) => void) => err({ code: 1 }) });
  expect(await getPositionNow()).toBeNull();
});
it('resolves null on timeout when the browser never answers', async () => {
  vi.useFakeTimers();
  stub({ getCurrentPosition: () => {} });
  const p = getPositionNow(1000);
  await vi.advanceTimersByTimeAsync(1001);
  expect(await p).toBeNull();
});
it('resolves null when unsupported or throwing', async () => {
  stub(undefined);
  expect(await getPositionNow()).toBeNull();
  stub({ getCurrentPosition: () => { throw new Error('x'); } });
  expect(await getPositionNow()).toBeNull();
});
