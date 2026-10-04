import { routeViews, recommended } from './routeViews';
import type { Snapshot } from '../data/types';
import type { Report } from '../core/types';
import { HOUR } from '../core/config';

const NOW = 1_000_000_000_000;
const rep = (targetId: string, value: string): Report => ({
  id: targetId + value, kind: 'road', targetId, value, createdAt: NOW - 60_000, hasEvidence: true, locationOk: true, byCommittee: false, confirmedByCommittee: false,
});
const seg = (id: string, name: string) => ({ id, name, geojson: { type: 'LineString', coordinates: [] } });
const base = {
  segments: [seg('a', 'ซอย A'), seg('b', 'ถนน B'), seg('c', 'ถนน C')],
  destinations: [{ id: 'd1', name: 'เมือง', kind: 'city', lat: 1, lng: 2 }, { id: 'd2', name: 'ตลาด', kind: 'market', lat: 3, lng: 4 }],
  routes: [
    { id: 'r1', name: 'ผ่าน B', destinationId: 'd1', segmentIds: ['a', 'b'], waypoints: [], distanceM: 5000 },
    { id: 'r2', name: 'ผ่าน C', destinationId: 'd1', segmentIds: ['a', 'c'], waypoints: [], distanceM: 7000 },
    { id: 'r3', name: 'ไปตลาด', destinationId: 'd2', segmentIds: ['a'], waypoints: [], distanceM: 1000 },
  ],
  settings: { ttlMs: { road: 3 * HOUR, water_level: HOUR, supply: HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
  marks: [], places: [],
};
const snap = (reports: Report[]) => ({ ...base, reports } as unknown as Snapshot);

it('ranks the open route first and names the blocked/unknown segments', () => {
  const v = routeViews(snap([rep('a', 'dry'), rep('b', 'impassable'), rep('c', 'dry')]), NOW, 'small_car', 'd1');
  expect(v.map((x) => x.route.id)).toEqual(['r2', 'r1']);
  expect(v[1]!.blockedNames).toEqual(['ถนน B']);
  expect(recommended(v)?.route.id).toBe('r2');
});
it('differs by vehicle class', () => {
  const s = snap([rep('a', 'dry'), rep('b', 'high_clearance'), rep('c', 'impassable')]);
  expect(recommended(routeViews(s, NOW, 'small_car', 'd1'))).toBeNull();
  expect(recommended(routeViews(s, NOW, 'high_clearance', 'd1'))?.route.id).toBe('r1');
});
it('never recommends a route with an unknown segment', () => {
  const v = routeViews(snap([rep('a', 'dry')]), NOW, 'small_car', 'd1');
  expect(v.every((x) => x.status.state === 'unknown')).toBe(true);
  expect(recommended(v)).toBeNull();
  expect(v[0]!.unknownNames.length).toBeGreaterThan(0);
});
it('filters by destination, or returns all when null', () => {
  const s = snap([rep('a', 'dry')]);
  expect(routeViews(s, NOW, 'small_car', 'd2').map((x) => x.route.id)).toEqual(['r3']);
  expect(routeViews(s, NOW, 'small_car', null)).toHaveLength(3);
});
