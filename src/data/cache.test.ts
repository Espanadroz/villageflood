import { parseCachedSnapshot } from './cache';
import { settledOrEmpty } from './settled';

const good = {
  segments: [], marks: [], places: [], destinations: [], routes: [], reports: [], feed: [], latest: [], recent: [], warnings: [], incidents: [],
  settings: {}, serverOffsetMs: -5, fetchedAt: 123,
};
const wrap = (o: unknown) => JSON.stringify(o);

describe('parseCachedSnapshot', () => {
  it('accepts a valid cache', () => {
    expect(parseCachedSnapshot(wrap({ v: 1, snapshot: good }))).toEqual(good);
  });
  it('rejects null, corrupt JSON and wrong version', () => {
    expect(parseCachedSnapshot(null)).toBeNull();
    expect(parseCachedSnapshot('{not json')).toBeNull();
    expect(parseCachedSnapshot(wrap({ v: 2, snapshot: good }))).toBeNull();
    expect(parseCachedSnapshot(wrap(good))).toBeNull();
  });
  it('rejects missing arrays and bad numbers', () => {
    const { reports, ...noReports } = good;
    expect(parseCachedSnapshot(wrap({ v: 1, snapshot: noReports }))).toBeNull();
    expect(parseCachedSnapshot(wrap({ v: 1, snapshot: { ...good, serverOffsetMs: null } }))).toBeNull();
    expect(parseCachedSnapshot(wrap({ v: 1, snapshot: { ...good, fetchedAt: 'x' } }))).toBeNull();
    expect(parseCachedSnapshot(wrap({ v: 1, snapshot: { ...good, settings: null } }))).toBeNull();
  });
});

describe('settledOrEmpty', () => {
  it('passes through arrays', async () => { expect(await settledOrEmpty(Promise.resolve([1, 2]))).toEqual([1, 2]); });
  it('yields [] on rejection or non-array', async () => {
    expect(await settledOrEmpty(Promise.reject(new Error('x')))).toEqual([]);
    expect(await settledOrEmpty(Promise.resolve(null as any))).toEqual([]);
  });
});
