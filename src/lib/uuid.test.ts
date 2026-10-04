import { afterEach, expect, it, vi } from 'vitest';
import { newId } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
afterEach(() => vi.unstubAllGlobals());

it('returns a v4 uuid and is unique', () => {
  const ids = new Set(Array.from({ length: 50 }, newId));
  expect(ids.size).toBe(50);
  for (const id of ids) expect(id).toMatch(V4);
});
const realGRV = crypto.getRandomValues.bind(crypto);
it('falls back to getRandomValues when randomUUID is undefined (plain http)', () => {
  vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => realGRV(a as Uint8Array<ArrayBuffer>), randomUUID: undefined });
  const ids = new Set(Array.from({ length: 50 }, newId));
  expect(ids.size).toBe(50);
  for (const id of ids) expect(id).toMatch(V4);
});
