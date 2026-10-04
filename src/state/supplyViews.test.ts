import { supplyViews } from './supplyViews';
import type { Snapshot } from '../data/types';
import type { Report } from '../core/types';
import { HOUR } from '../core/config';

const NOW = 1_000_000_000_000;
const rep = (targetId: string, value: string, ago = 60_000): Report => ({
  id: targetId + value, kind: 'supply', targetId, value, createdAt: NOW - ago, hasEvidence: false, locationOk: true, byCommittee: false, confirmedByCommittee: false,
});
const place = (id: string, category: string, lng: number) => ({ id, name: id, category, geojson: { type: 'Point', coordinates: [lng, 13.0] } });
const snap = (reports: Report[], extraPlaces: unknown[] = []) => ({
  places: [place('far-open', 'store', 100.5), place('near-open', 'store', 100.01), place('closed', 'store', 100.02), place('unk', 'store', 100.0), place('food', 'food', 100.0), ...extraPlaces],
  reports, segments: [], marks: [],
  settings: { ttlMs: { road: HOUR, water_level: HOUR, supply: 12 * HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 13.0, lng: 100.0 } },
} as unknown as Snapshot);

it('orders open first (nearest first), closed after, unknown last', () => {
  const v = supplyViews(snap([rep('far-open', 'open'), rep('near-open', 'open'), rep('closed', 'closed')]), NOW, 'store');
  expect(v.map((x) => x.place.id)).toEqual(['near-open', 'far-open', 'closed', 'unk']);
});
it('shows a place as unknown once its report is older than 12h', () => {
  const v = supplyViews(snap([rep('near-open', 'open', 13 * HOUR)]), NOW, 'store');
  expect(v.find((x) => x.place.id === 'near-open')?.status.value).toBe('unknown');
});
it('filters by category', () => {
  expect(supplyViews(snap([]), NOW, 'food').map((x) => x.place.id)).toEqual(['food']);
});
it('does not crash on missing/NaN coordinates: Infinity distance, sorted last within status group', () => {
  const bad = [
    { id: 'nan', name: 'nan', category: 'store', geojson: { type: 'Point', coordinates: [NaN, NaN] } },
    { id: 'nocoords', name: 'nocoords', category: 'store', geojson: undefined },
    { id: 'empty', name: 'empty', category: 'store', geojson: { type: 'Point', coordinates: [] } },
  ];
  const v = supplyViews(snap([rep('nan', 'open'), rep('nocoords', 'open'), rep('empty', 'open'), rep('far-open', 'open')], bad), NOW, 'store');
  const ids = v.map((x) => x.place.id);
  expect(ids[0]).toBe('far-open');
  expect(ids.slice(1, 4).sort()).toEqual(['empty', 'nan', 'nocoords']);
  expect(v.find((x) => x.place.id === 'nan')?.distanceM).toBe(Infinity);
  expect(v.find((x) => x.place.id === 'nocoords')?.distanceM).toBe(Infinity);
  expect(v.find((x) => x.place.id === 'empty')?.distanceM).toBe(Infinity);
});
