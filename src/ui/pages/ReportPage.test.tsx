import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ReportPage } from './ReportPage';

vi.mock('../../state/SnapshotContext', () => ({
  useData: () => ({
    now: 1, error: null, loading: false, reload() {},
    snapshot: {
      segments: [{ id: 'seg1', name: 'ซอย 1' }], marks: [], places: [], reports: [], feed: [],
      settings: { ttlMs: {}, agencyMaxAgeMs: 1, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
    },
  }),
}));
vi.mock('../../state/outbox', () => ({ outbox: { add: vi.fn(), failed: vi.fn().mockResolvedValue([]), flush: vi.fn().mockResolvedValue({ sent: 0, failed: 0, stoppedOnRetry: false }) }, useOutboxCount: () => 0 }));
vi.mock('../../lib/useGeolocation', () => ({ useGeolocation: () => ({ pos: null, error: 'denied', refresh() {} }) }));

beforeEach(() => { localStorage.setItem('flood.consent.v1', 'yes'); localStorage.setItem('flood.nickname', 'สมชาย'); });

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
