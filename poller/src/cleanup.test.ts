import { chunk, deleteOrphanMedia, listEvidenceObjects, selectExpiredMedia, selectOrphanObjects, type StorageEntry } from './cleanup';

const NOW = new Date('2026-10-31T00:00:00Z');
const rows = [
  { id: 'a', media_path: 'd/a.jpg', created_at: '2026-09-30T00:00:00Z' },
  { id: 'b', media_path: 'd/b.jpg', created_at: '2026-10-10T00:00:00Z' },
  { id: 'c', media_path: null, created_at: '2026-08-01T00:00:00Z' },
];
it('selects only reports with media older than the retention period', () => {
  expect(selectExpiredMedia(rows, NOW, 30).map((r) => r.id)).toEqual(['a']);
});

describe('orphan storage objects', () => {
  it('selects objects older than retention by the object created_at, skipping unknown dates', () => {
    const objs = [
      { path: 'k1/old.jpg', created_at: '2026-09-29T00:00:00Z' },
      { path: 'k1/new.jpg', created_at: '2026-10-30T00:00:00Z' },
      { path: 'k2/nodate.jpg', created_at: null },
      { path: 'k2/bad.jpg', created_at: 'garbage' },
    ];
    expect(selectOrphanObjects(objs, NOW, 30)).toEqual(['k1/old.jpg']);
  });
  it('chunks into batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
  it('lists every folder and file with pagination', async () => {
    const file = (name: string): StorageEntry => ({ name, id: `id-${name}`, created_at: '2026-01-01T00:00:00Z' });
    const folder = (name: string): StorageEntry => ({ name, id: null });
    const tree: Record<string, StorageEntry[]> = {
      '': [folder('f1'), folder('f2'), folder('f3'), file('stray.jpg')],
      f1: [file('a'), file('b'), file('c')],
      f2: [],
      f3: [file('z')],
    };
    const calls: string[] = [];
    const list = async (prefix: string, offset: number, limit: number) => {
      calls.push(`${prefix}@${offset}`);
      return (tree[prefix] ?? []).slice(offset, offset + limit);
    };
    const out = await listEvidenceObjects(list, 2);
    expect(out.map((o) => o.path).sort()).toEqual(['f1/a', 'f1/b', 'f1/c', 'f3/z', 'stray.jpg']);
    expect(calls).toContain('@2');
    expect(calls).toContain('f1@2');
  });
  it('deletes old orphans in batches and clears report rows that pointed at them', async () => {
    const files = Array.from({ length: 150 }, (_, i) => ({ name: `o${i}.jpg`, id: `x${i}`, created_at: '2026-09-01T00:00:00Z' }));
    files.push({ name: 'fresh.jpg', id: 'fr', created_at: '2026-10-30T00:00:00Z' });
    const removed: string[][] = [];
    const cleared: string[][] = [];
    const db = {
      storage: { from: () => ({
        list: async (prefix: string, o: { limit: number; offset: number }) => ({ data: (prefix === '' ? [{ name: 'k', id: null }] : files).slice(o.offset, o.offset + o.limit), error: null }),
        remove: async (paths: string[]) => { removed.push(paths); return { data: paths.map((name) => ({ name })), error: null }; },
      }) },
      from: () => ({ update: () => ({ in: async (_c: string, paths: string[]) => { cleared.push(paths); return { error: null }; } }) }),
    };
    expect(await deleteOrphanMedia(db as never, NOW, 30)).toBe(150);
    expect(removed.map((b) => b.length)).toEqual([100, 50]);
    expect(removed.flat()).not.toContain('k/fresh.jpg');
    expect(cleared.flat()).toHaveLength(150);
    // the row update goes in the URL (?media_path=in.(...)): keep each filter short ("URI too long" on the real gateway)
    expect(Math.max(...cleared.map((c) => c.length))).toBeLessThanOrEqual(20);
  });
  it('throws when listing fails (so the failure is visible)', async () => {
    const db = { storage: { from: () => ({ list: async () => ({ data: null, error: new Error('list failed') }) }) } };
    await expect(deleteOrphanMedia(db as never, NOW, 30)).rejects.toThrow('list failed');
  });
});

it('report-linked cleanup clears rows in short URL batches', async () => {
  const data = Array.from({ length: 120 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, media_path: `k/${i}.jpg`, created_at: '2026-09-01T00:00:00Z' }));
  const idBatches: string[][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'not', 'lt', 'limit']) q[m] = () => q;
  (q as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
  const db = {
    from: () => ({ ...q, update: () => ({ in: async (_c: string, ids: string[]) => { idBatches.push(ids); return { error: null }; } }) }),
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
  };
  const { deleteExpiredMedia } = await import('./cleanup');
  expect(await deleteExpiredMedia(db as never, NOW, 30)).toBe(120);
  expect(idBatches.flat()).toHaveLength(120);
  expect(Math.max(...idBatches.map((b) => b.length))).toBeLessThanOrEqual(20);
});
