import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { FeedItem, Snapshot } from '../../data/types';
import { FeedItemCard } from './FeedItemCard';

const reload = vi.fn();
vi.mock('../../state/SnapshotContext', () => ({ useData: () => ({ reload }) }));
vi.mock('../../data/device', () => ({ getDeviceId: () => 'dev-1' }));
const rpc = vi.fn();
vi.mock('../../data/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const snap = { segments: [{ id: 'seg1', name: 'ซอย 1' }], marks: [], places: [] } as unknown as Snapshot;
const item: FeedItem = {
  id: 'r1', kind: 'road', targetId: 'seg1', value: 'impassable', nickname: 'สมชาย', createdAt: 0, mediaUrl: null, mediaType: null,
  note: null, byCommittee: false, confirmedByCommittee: false, confirmations: 0, locationOk: true,
};

beforeEach(() => { rpc.mockReset(); reload.mockReset(); });

it('confirms via rpc and reloads on success', async () => {
  rpc.mockResolvedValue({ error: null });
  render(<FeedItemCard item={item} snapshot={snap} now={1000} />);
  await userEvent.click(screen.getByRole('button', { name: 'ยืนยันรายงาน ซอย 1' }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(rpc).toHaveBeenCalledWith('confirm_report', { p_device: 'dev-1', p_report: 'r1' });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows the Thai error, does not reload, and disables the button while pending', async () => {
  let resolve!: (v: unknown) => void;
  rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
  render(<FeedItemCard item={item} snapshot={snap} now={1000} />);
  await userEvent.click(screen.getByRole('button', { name: 'ยืนยันรายงาน ซอย 1' }));
  expect(screen.getByRole('button', { name: 'ยืนยันรายงาน ซอย 1' })).toBeDisabled();
  resolve({ error: { message: 'not_a_reporter' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('ต้องส่งรายงานอย่างน้อย 1 ครั้ง');
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'ยืนยันรายงาน ซอย 1' })).toBeEnabled();
});

const snapTtl = { ...snap, settings: { ttlMs: { road: 3 * 3_600_000, water_level: 1, supply: 1 } } } as unknown as Snapshot;
it('marks an expired road report and labels the confirm button with the target', () => {
  render(<FeedItemCard item={{ ...item, createdAt: 0 }} snapshot={snapTtl} now={4 * 3_600_000} />);
  expect(screen.getByText('หมดอายุแล้ว — ไม่ใช้ตัดสินสถานะ')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ยืนยันรายงาน ซอย 1' })).toBeInTheDocument();
});
it('shows no expiry marker for a fresh report', () => {
  render(<FeedItemCard item={{ ...item, createdAt: 2 * 3_600_000 }} snapshot={snapTtl} now={4 * 3_600_000} />);
  expect(screen.queryByText('หมดอายุแล้ว — ไม่ใช้ตัดสินสถานะ')).toBeNull();
});

it('treats a report exactly at its TTL as expired (same boundary as the engine)', () => {
  render(<FeedItemCard item={{ ...item, createdAt: 0 }} snapshot={snapTtl} now={3 * 3_600_000} />);
  expect(screen.getByText('หมดอายุแล้ว — ไม่ใช้ตัดสินสถานะ')).toBeInTheDocument();
});
it('is not expired one millisecond before the TTL', () => {
  render(<FeedItemCard item={{ ...item, createdAt: 0 }} snapshot={snapTtl} now={3 * 3_600_000 - 1} />);
  expect(screen.queryByText('หมดอายุแล้ว — ไม่ใช้ตัดสินสถานะ')).toBeNull();
});
