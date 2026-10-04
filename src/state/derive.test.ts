import { derive } from './derive';
import type { Snapshot } from '../data/types';
import type { Report } from '../core/types';
import { HOUR } from '../core/config';

const NOW = 1_000_000_000_000;
const rep = (o: Partial<Report>): Report => ({
  id: Math.random().toString(), kind: 'road', targetId: 'seg1', value: 'dry', createdAt: NOW - 60_000,
  hasEvidence: true, locationOk: true, byCommittee: false, confirmedByCommittee: false, ...o,
});
const snap = (reports: Report[]): Snapshot => ({
  segments: [{ id: 'seg1', name: 'a', geojson: { type: 'LineString', coordinates: [] } }, { id: 'seg2', name: 'b', geojson: { type: 'LineString', coordinates: [] } }],
  marks: [{ id: 'm1', name: 'm', geojson: { type: 'Point', coordinates: [0, 0] }, levels: [] }],
  places: [{ id: 'p1', name: 'p', category: 'store', geojson: { type: 'Point', coordinates: [0, 0] } }],
  reports, settings: { ttlMs: { road: 3 * HOUR, water_level: 2 * HOUR, supply: 12 * HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
} as unknown as Snapshot);

it('derives states per target kind using the committee TTL settings', () => {
  const d = derive(snap([
    rep({ targetId: 'seg1', value: 'dry' }),
    rep({ kind: 'water_level', targetId: 'm1', value: '2' }),
    rep({ kind: 'supply', targetId: 'p1', value: 'open', hasEvidence: false }),
  ]), NOW);
  expect(d.segmentStates.seg1?.value).toBe('dry');
  expect(d.segmentStates.seg2?.value).toBe('unknown');
  expect(d.markStates.m1?.value).toBe('2');
  expect(d.placeStates.p1?.value).toBe('open');
});
it('turns a 4-hour-old road report into unknown', () => {
  expect(derive(snap([rep({ createdAt: NOW - 4 * HOUR })]), NOW).segmentStates.seg1?.value).toBe('unknown');
});
