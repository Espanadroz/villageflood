import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { Snapshot } from '../../data/types';
import { MapPage } from './MapPage';

const NOW = 1_000_000_000_000;
const mapProps = vi.fn();
vi.mock('../map/MapView', () => ({
  MapView: (p: { incidents: unknown[]; onSelectSegment: (id: string) => void }) => {
    mapProps(p);
    return <button onClick={() => p.onSelectSegment('seg1')}>pick</button>;
  },
}));
const snapshot = {
  segments: [{ id: 'seg1', name: 'ซอย 1', geojson: { type: 'LineString', coordinates: [] } }], marks: [], places: [], feed: [], reports: [],
  incidents: [
    { id: 'old', title: 'o', lat: 0, lng: 0, severity: 1, startAt: 0, stopAt: NOW - 1 },
    { id: 'live', title: 'l', lat: 0, lng: 0, severity: 1, startAt: 0, stopAt: NOW + 1000 },
  ],
  settings: { ttlMs: { road: 1, water_level: 1, supply: 1 }, origin: { lat: 0, lng: 0 } },
} as unknown as Snapshot;
vi.mock('../../state/SnapshotContext', () => ({ useData: () => ({ snapshot, now: NOW, reload: vi.fn() }) }));

it('hides expired incidents using the server-corrected now', async () => {
  render(<MemoryRouter><MapPage /></MemoryRouter>);
  await userEvent.click(screen.getByLabelText(/เหตุน้ำท่วมจาก Longdo/));
  const last = mapProps.mock.calls.at(-1)![0] as { incidents: { id: string }[] };
  expect(last.incidents.map((i) => i.id)).toEqual(['live']);
});

it('never presents an unknown segment as passable', async () => {
  render(<MemoryRouter><MapPage /></MemoryRouter>);
  await userEvent.click(screen.getByText('pick'));
  expect(document.querySelector('.badge--unknown')).toHaveTextContent('ไม่ทราบ');
  expect(screen.getByText(/ห้ามถือว่าผ่านได้/)).toBeInTheDocument();
  const card = screen.getByRole('heading', { name: 'ซอย 1' }).closest('section')!;
  expect(card).toHaveTextContent('ไม่มีข้อมูล');
});

it('lists every segment as a button that selects it (text fallback path)', async () => {
  render(<MemoryRouter><MapPage /></MemoryRouter>);
  const btn = screen.getByRole('button', { name: /ซอย 1/ });
  expect(btn).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(btn);
  expect(btn).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(/ห้ามถือว่าผ่านได้/)).toBeInTheDocument();
});
it('shows a one-time banner when the map reports an error', async () => {
  render(<MemoryRouter><MapPage /></MemoryRouter>);
  const p = mapProps.mock.calls.at(-1)![0] as { onError: (m: string) => void };
  const { act } = await import('@testing-library/react');
  act(() => { p.onError('x'); p.onError('y'); });
  expect(screen.getAllByText('แผนที่โหลดไม่สำเร็จ — ดูสถานะถนนจากรายการด้านล่าง')).toHaveLength(1);
});
