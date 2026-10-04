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
  expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument();
});
