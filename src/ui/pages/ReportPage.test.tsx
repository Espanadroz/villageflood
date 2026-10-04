import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ReportPage } from './ReportPage';
import { outbox } from '../../state/outbox';
import * as geo from '../../lib/useGeolocation';

vi.mock('../../state/SnapshotContext', () => ({
  useData: () => ({
    now: 1, error: null, loading: false, reload() {},
    snapshot: {
      segments: [{ id: 'seg1', name: 'ซอย 1' }], marks: [], places: [], reports: [], feed: [],
      settings: { ttlMs: {}, agencyMaxAgeMs: 1, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
    },
  }),
}));
vi.mock('../../state/outbox', () => ({ outbox: { add: vi.fn(), pending: vi.fn(), failed: vi.fn(), flush: vi.fn() } }));
vi.mock('../../state/OutboxContext', () => ({ useOutboxStatus: () => ({ pendingCount: 0, failedCount: 0, refresh: vi.fn() }) }));
vi.mock('../../lib/useGeolocation', () => ({
  useGeolocation: vi.fn(() => ({ pos: null, error: 'denied', refresh() {} })),
  getPositionNow: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../lib/media', async (orig) => ({ ...(await orig<typeof import('../../lib/media')>()), compressImage: async (f: File) => new Blob([f], { type: 'image/jpeg' }) }));

const box = outbox as unknown as Record<'add' | 'pending' | 'failed' | 'flush', ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  box.add.mockResolvedValue(undefined); box.pending.mockResolvedValue([]); box.failed.mockResolvedValue([]);
  box.flush.mockResolvedValue({ sent: 1, failed: 0, stoppedOnRetry: false });
  vi.mocked(geo.useGeolocation).mockReturnValue({ pos: null, error: 'denied', refresh() {} });
  vi.mocked(geo.getPositionNow).mockResolvedValue(null);
  localStorage.clear(); localStorage.setItem('flood.consent.v1', 'yes'); localStorage.setItem('flood.nickname', 'สมชาย'); });

const open = () => render(<MemoryRouter initialEntries={['/report?kind=road&target=seg1']}><ReportPage /></MemoryRouter>);

it('blocks a "รถเล็กไปได้" report that has no photo and explains why', async () => {
  open();
  await userEvent.click(screen.getByLabelText('รถเล็กไปได้'));
  await userEvent.click(screen.getByRole('button', { name: 'ส่งรายงาน' }));
  expect(screen.getByText('ต้องแนบรูปหรือวิดีโอที่ถ่ายใหม่เป็นหลักฐาน')).toBeInTheDocument();
});
it('marks evidence as required for passable claims and optional for ผ่านไม่ได้', async () => {
  open();
  await userEvent.click(screen.getByLabelText('รถเล็กไปได้'));
  expect(screen.getByText('(จำเป็น)')).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText('ผ่านไม่ได้'));
  expect(screen.getByText('(ไม่บังคับ)')).toBeInTheDocument();
});
it('warns when location is unavailable', () => {
  open();
  expect(screen.getByText(/ไม่ได้ตำแหน่ง/)).toBeInTheDocument();
});

const submitImpassable = async () => {
  open();
  await userEvent.click(screen.getByLabelText('ผ่านไม่ได้'));
  await userEvent.click(screen.getByRole('button', { name: 'ส่งรายงาน' }));
};
const SAVED = /เก็บรายงานไว้ในเครื่องแล้ว/;

it('shows success after add + flush when the item is in neither list', async () => {
  await submitImpassable();
  expect(await screen.findByText('ส่งรายงานแล้ว ขอบคุณครับ/ค่ะ')).toBeInTheDocument();
  expect(box.add).toHaveBeenCalledTimes(1);
  expect(box.flush).toHaveBeenCalledTimes(1);
});
it('uses a fresh position at submit time', async () => {
  vi.mocked(geo.getPositionNow).mockResolvedValue({ lat: 1, lng: 2, accuracy: 3 });
  await submitImpassable();
  await screen.findByText('ส่งรายงานแล้ว ขอบคุณครับ/ค่ะ');
  expect(box.add.mock.calls[0]![0].draft).toMatchObject({ lat: 1, lng: 2 });
});
it('falls back to the last hook position', async () => {
  vi.mocked(geo.useGeolocation).mockReturnValue({ pos: { lat: 9, lng: 8, accuracy: 1 }, error: null, refresh() {} });
  await submitImpassable();
  await screen.findByText('ส่งรายงานแล้ว ขอบคุณครับ/ค่ะ');
  expect(box.add.mock.calls[0]![0].draft).toMatchObject({ lat: 9, lng: 8 });
});
it('shows an error, clears busy and keeps the form when outbox.add rejects', async () => {
  box.add.mockRejectedValue(new Error('idb'));
  await submitImpassable();
  expect(await screen.findByText('บันทึกไม่สำเร็จ — รายงานยังไม่ถูกเก็บ กรุณาลองอีกครั้ง')).toBeInTheDocument();
  expect(box.flush).not.toHaveBeenCalled();
  const btn = screen.getByRole('button', { name: 'ส่งรายงาน' });
  await waitFor(() => expect(btn).toBeEnabled());
  expect(screen.getByLabelText('ผ่านไม่ได้')).toBeChecked();
});
it('treats the report as saved when flush rejects', async () => {
  box.flush.mockRejectedValue(new Error('net'));
  await submitImpassable();
  expect(await screen.findByText(SAVED)).toBeInTheDocument();
});
it('says saved/will send when the item is still pending', async () => {
  box.pending.mockImplementation(async () => [{ id: box.add.mock.calls[0]![0].id }]);
  await submitImpassable();
  expect(await screen.findByText(SAVED)).toBeInTheDocument();
});
it('shows the failure reason when the item is in the failed list (matched by id)', async () => {
  box.failed.mockImplementation(async () => [
    { item: { id: 'other' }, reason: 'rate_limited' },
    { item: { id: box.add.mock.calls[0]![0].id }, reason: 'rejected' },
  ]);
  await submitImpassable();
  expect(await screen.findByText('รายงานนี้ยังไม่ได้ถูกส่ง')).toBeInTheDocument();
  expect(screen.queryByText('ส่งรายงานแล้ว ขอบคุณครับ/ค่ะ')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ส่งรายงาน' })).toBeEnabled();
});
it('does not ask for location before consent', async () => {
  localStorage.removeItem('flood.consent.v1');
  open();
  expect(screen.getByText('ยอมรับและส่งรายงานต่อ')).toBeInTheDocument();
  expect(geo.useGeolocation).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText('ยอมรับและส่งรายงานต่อ'));
  expect(geo.useGeolocation).toHaveBeenCalled();
});
it('ignores a target that does not belong to the kind', async () => {
  render(<MemoryRouter initialEntries={['/report?kind=supply&target=seg1']}><ReportPage /></MemoryRouter>);
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
  await userEvent.click(screen.getByLabelText('เปิด'));
  await userEvent.click(screen.getByRole('button', { name: 'ส่งรายงาน' }));
  expect(screen.getByText('กรุณาเลือกจุดที่รายงาน')).toBeInTheDocument();
});
it('resets the evidence preview when the kind changes', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
  const { container } = open();
  const input = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
  await userEvent.upload(input, new File(['a'], 'a.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
  expect(await screen.findByAltText('หลักฐาน')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'ระดับน้ำ' }));
  expect(screen.queryByAltText('หลักฐาน')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
});
