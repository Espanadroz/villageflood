import { beforeEach, expect, it, vi } from 'vitest';

const upload = vi.fn();
const rpc = vi.fn();
vi.mock('./supabase', () => ({ supabase: { storage: { from: () => ({ upload }) }, rpc: (...a: unknown[]) => rpc(...a) } }));

import { sendItem, type OutboxItem } from './submit';

const DEVICE = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';
const base = (o: Partial<OutboxItem> = {}): OutboxItem => ({
  id: '33333333-3333-4333-8333-333333333333', createdAt: Date.now(), attempts: 0, blob: null, mediaType: null,
  draft: { deviceId: DEVICE, nickname: 'n', kind: 'road', targetId: 's', value: 'impassable', lat: null, lng: null, note: null },
  ...o,
});

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ error: null, data: 'id' });
  localStorage.clear();
});

it('sends the observation age, not a fresh timestamp', async () => {
  await sendItem(base({ createdAt: Date.now() - 4 * 3_600_000 - 500 }));
  expect(rpc.mock.calls[0]![1]).toMatchObject({ p_age_seconds: 14400 });
});
it('sends age 0 for a fresh item and for a phone clock that moved backwards', async () => {
  await sendItem(base());
  await sendItem(base({ createdAt: Date.now() + 3_600_000 }));
  expect(rpc.mock.calls.map((c) => c[1].p_age_seconds)).toEqual([0, 0]);
});
it('uploads into the upload-key folder (never the device id) and passes the key', async () => {
  await sendItem(base({ blob: new Blob(['x']), mediaType: 'image/jpeg', uploadKey: KEY }));
  const path = upload.mock.calls[0]![0] as string;
  expect(path).toBe(`${KEY}/33333333-3333-4333-8333-333333333333.jpg`);
  expect(path).not.toContain(DEVICE);
  expect(rpc.mock.calls[0]![1]).toMatchObject({ p_media_path: path, p_upload_key: KEY, p_device: DEVICE });
});
it('falls back to the persisted upload key for items queued before the key was stored on them', async () => {
  await sendItem(base({ blob: new Blob(['x']), mediaType: 'image/jpeg' }));
  const path = upload.mock.calls[0]![0] as string;
  const key = path.split('/')[0]!;
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  expect(key).not.toBe(DEVICE);
  expect(rpc.mock.calls[0]![1].p_upload_key).toBe(key);
});
it('sends no upload key without media', async () => {
  await sendItem(base({ uploadKey: KEY }));
  expect(upload).not.toHaveBeenCalled();
  expect(rpc.mock.calls[0]![1]).toMatchObject({ p_media_path: null, p_upload_key: null });
});
