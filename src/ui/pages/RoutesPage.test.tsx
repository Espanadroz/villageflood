import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { Snapshot } from '../../data/types';
import type { Report } from '../../core/types';
import { RoutesPage } from './RoutesPage';

const NOW = 1_000_000_000_000;
const HOUR = 3_600_000;
vi.mock('../map/MapView', () => ({ MapView: () => <div>map</div> }));
const rep = (targetId: string, value: string): Report => ({
  id: targetId + value, kind: 'road', targetId, value, createdAt: NOW - 60_000, hasEvidence: true, locationOk: true, byCommittee: false, confirmedByCommittee: false,
} as Report);
const seg = (id: string, name: string) => ({ id, name, geojson: { type: 'LineString', coordinates: [] } });
let reports: Report[] = [];
const snap = (): Snapshot => ({
  segments: [seg('a', 'ซอย A'), seg('b', 'ถนน B')],
  destinations: [{ id: 'd1', name: 'เมือง', kind: 'city', lat: 1, lng: 2 }, { id: 'd2', name: 'ตลาด', kind: 'market', lat: 3, lng: 4 }],
  routes: [{ id: 'r1', name: 'ผ่าน B', destinationId: 'd1', segmentIds: ['a', 'b'], waypoints: [], distanceM: 5000 }],
  settings: { ttlMs: { road: 3 * HOUR, water_level: HOUR, supply: HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
  marks: [], places: [], feed: [], incidents: [], reports,
}) as unknown as Snapshot;
vi.mock('../../state/SnapshotContext', () => ({ useData: () => ({ snapshot: snap(), now: NOW, reload: vi.fn() }) }));

const go = () => render(<MemoryRouter><RoutesPage /></MemoryRouter>);
beforeEach(() => { localStorage.clear(); });

it('no star and a warning banner when nothing is ok (unknown)', () => {
  reports = [rep('a', 'dry')];
  go();
  expect(screen.queryByText(/★/)).toBeNull();
  expect(screen.getByText(/ยังไม่มีเส้นทางที่ยืนยันได้ว่าไปได้/)).toBeInTheDocument();
});

it('vehicle toggle changes status; star + TTL only on ok; link only when ok', async () => {
  reports = [rep('a', 'dry'), rep('b', 'high_clearance')];
  go();
  expect(screen.getByText(/ไปไม่ได้ สำหรับรถเล็ก/)).toBeInTheDocument();
  expect(screen.queryByText(/★/)).toBeNull();
  expect(screen.queryByText(/ไปได้ตามรายงานที่ไม่เก่าเกิน/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'ดูบนแผนที่' }));
  expect(screen.queryByText('เปิดนำทางใน Google Maps')).toBeNull();
  expect(screen.getByText(/ไม่แนะนำให้นำทางเส้นทางนี้ — มีช่วงที่ผ่านไม่ได้/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'รถยกสูง' }));
  expect(screen.getByText(/ไปได้ \(ตามรายงานล่าสุด\) สำหรับรถยกสูง/)).toBeInTheDocument();
  expect(screen.getByText(/★ แนะนำ/)).toBeInTheDocument();
  expect(screen.getByText(/ไปได้ตามรายงานที่ไม่เก่าเกิน 3 ชม\./)).toBeInTheDocument();
  expect(screen.queryByText(/ไม่แนะนำให้นำทาง/)).toBeNull();
  const link = screen.getByRole('link', { name: 'เปิดนำทางใน Google Maps' });
  expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  expect(screen.queryByText(/ยังไม่มีเส้นทางที่ยืนยันได้ว่าไปได้/)).toBeNull();
});

it('unknown route shows the no-navigation text and aria-expanded', async () => {
  reports = [rep('a', 'dry')];
  go();
  const btn = screen.getByRole('button', { name: 'ดูบนแผนที่' });
  expect(btn).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(btn);
  expect(screen.getByRole('button', { name: 'ซ่อนแผนที่' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/ไม่แนะนำให้นำทางเส้นทางนี้ — ยังไม่มีข้อมูลบางช่วง/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Google Maps/ })).toBeNull();
});

it('empty destination filter message', async () => {
  reports = [];
  go();
  await userEvent.click(screen.getByRole('button', { name: 'ตลาด' }));
  expect(screen.getByText('ยังไม่มีเส้นทางไปยังปลายทางนี้')).toBeInTheDocument();
  expect(screen.queryByText('ยังไม่มีเส้นทางในระบบ')).toBeNull();
});
