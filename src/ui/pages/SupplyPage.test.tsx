import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { Snapshot } from '../../data/types';
import type { Report } from '../../core/types';
import { SupplyPage } from './SupplyPage';

const NOW = 1_000_000_000_000;
const HOUR = 3_600_000;
const rep = (targetId: string, value: string, ago: number): Report => ({
  id: targetId + value, kind: 'supply', targetId, value, createdAt: NOW - ago, hasEvidence: false, locationOk: true, byCommittee: false, confirmedByCommittee: false,
} as Report);
const place = (id: string, name: string, category: string, coordinates: number[]) => ({ id, name, category, geojson: { type: 'Point', coordinates } });
let reports: Report[] = [];
let places: unknown[] = [];
const snap = (): Snapshot => ({
  segments: [], marks: [], places, reports, feed: [], incidents: [],
  settings: { ttlMs: { road: HOUR, water_level: HOUR, supply: 12 * HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 13, lng: 100 } },
}) as unknown as Snapshot;
vi.mock('../../state/SnapshotContext', () => ({ useData: () => ({ snapshot: snap(), now: NOW, reload: vi.fn() }) }));

const go = () => render(<MemoryRouter><SupplyPage /></MemoryRouter>);
const OLD_TEXT = 'ยังไม่มีรายงานล่าสุด — โทรหรือสอบถามก่อนเดินทาง';
const badge = (t: string) => document.querySelector('.badge')?.textContent === t;

beforeEach(() => {
  places = [place('s1', 'ร้าน 1', 'store', [100.01, 13]), place('f1', 'อาหาร 1', 'food', [100.02, 13])];
  reports = [];
});

it('expired open report shows unknown, warning text and no open badge', () => {
  reports = [rep('s1', 'open', 13 * HOUR)];
  places = [places[0]];
  go();
  expect(screen.getByText('ไม่ทราบ')).toBeInTheDocument();
  expect(screen.getByText(OLD_TEXT)).toBeInTheDocument();
  expect(screen.queryByText('เปิด')).toBeNull();
});

it('fresh open report shows the open badge', () => {
  reports = [rep('s1', 'open', 60_000)];
  places = [places[0]];
  go();
  expect(badge('เปิด')).toBe(true);
  expect(screen.queryByText(OLD_TEXT)).toBeNull();
});

it('non-finite coordinates: no maps link and no distance', () => {
  places = [place('bad', 'เสีย', 'store', [NaN, NaN])];
  go();
  expect(screen.getByText('เสีย')).toBeInTheDocument();
  expect(screen.queryByText('เปิดแผนที่')).toBeNull();
  expect(screen.queryByText(/กม\./)).toBeNull();
});

it('category filter removes other categories', async () => {
  go();
  expect(screen.getByText('ร้าน 1')).toBeInTheDocument();
  expect(screen.getByText('อาหาร 1')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'ร้านอาหาร' }));
  expect(screen.getByText('อาหาร 1')).toBeInTheDocument();
  expect(screen.queryByText('ร้าน 1')).toBeNull();
});

it('report link targets the place', () => {
  places = [places[0]];
  go();
  expect(screen.getByRole('link', { name: 'รายงานสถานะ' })).toHaveAttribute('href', '/report?kind=supply&target=s1');
  expect(screen.getByRole('link', { name: 'เปิดแผนที่' })).toHaveAttribute('rel', 'noreferrer noopener');
});
