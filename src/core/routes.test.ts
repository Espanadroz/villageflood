import { isPassable, routeStatus, rankRoutes, pickWaypoints, buildGoogleMapsUrl, buildGoogleMapsSearchUrl, type RouteDef } from './routes';
import type { Resolved, RoadStatus } from './types';

const seg = (value: Resolved<RoadStatus>['value'], asOf: number | null = 1000, conflict = false): Resolved<RoadStatus> =>
  ({ value, asOf, conflict, basisReportId: null });
const route = (segmentIds: string[], distanceM = 1000, id = 'r'): RouteDef =>
  ({ id, name: id, destinationId: 'd', segmentIds, waypoints: [], distanceM });

describe('isPassable', () => {
  it('small car: only dry and small_car', () => {
    expect(isPassable('small_car', 'dry')).toBe(true);
    expect(isPassable('small_car', 'small_car')).toBe(true);
    expect(isPassable('small_car', 'high_clearance')).toBe(false);
    expect(isPassable('small_car', 'impassable')).toBe(false);
  });
  it('high clearance: everything except impassable', () => {
    expect(isPassable('high_clearance', 'high_clearance')).toBe(true);
    expect(isPassable('high_clearance', 'impassable')).toBe(false);
  });
});

describe('routeStatus', () => {
  const segs = { a: seg('dry', 3000), b: seg('high_clearance', 2000), c: seg('unknown', null), d: seg('impassable', 4000, true) };
  it('ok when every segment passable; reports the oldest segment time', () => {
    expect(routeStatus(route(['a']), segs, 'small_car')).toMatchObject({ state: 'ok', oldestAsOf: 3000 });
  });
  it('same route differs by vehicle class', () => {
    expect(routeStatus(route(['a', 'b']), segs, 'small_car').state).toBe('blocked');
    expect(routeStatus(route(['a', 'b']), segs, 'high_clearance').state).toBe('ok');
  });
  it('unknown segment makes the whole route unknown, and lists it', () => {
    expect(routeStatus(route(['a', 'c']), segs, 'small_car')).toMatchObject({ state: 'unknown', unknownSegmentIds: ['c'], oldestAsOf: 3000 });
  });
  it('blocked beats unknown', () => {
    expect(routeStatus(route(['c', 'd']), segs, 'high_clearance')).toMatchObject({ state: 'blocked', blockedSegmentIds: ['d'], unknownSegmentIds: ['c'] });
  });
  it('treats a segment missing from the map as unknown, never ok', () => {
    expect(routeStatus(route(['zzz']), segs, 'small_car').state).toBe('unknown');
  });
  it('propagates conflict', () => {
    expect(routeStatus(route(['d']), segs, 'small_car').hasConflict).toBe(true);
  });
  it('an empty route is unknown, never ok', () => {
    expect(routeStatus(route([]), segs, 'small_car').state).toBe('unknown');
  });
});

describe('rankRoutes', () => {
  const mk = (id: string, state: 'ok' | 'unknown' | 'blocked', distanceM: number) => ({
    route: route([], distanceM, id),
    status: { state, blockedSegmentIds: [], unknownSegmentIds: [], hasConflict: false, oldestAsOf: null },
  });
  it('orders ok < unknown < blocked, then by distance', () => {
    const ranked = rankRoutes([mk('blocked-short', 'blocked', 100), mk('unk', 'unknown', 200), mk('ok-long', 'ok', 900), mk('ok-short', 'ok', 500)]);
    expect(ranked.map((x) => x.route.id)).toEqual(['ok-short', 'ok-long', 'unk', 'blocked-short']);
  });
});

describe('pickWaypoints', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ lat: i, lng: i }));
  it('returns all when within the limit', () => expect(pickWaypoints(pts.slice(0, 2))).toHaveLength(2));
  it('reduces to the limit with unique interior points in order', () => {
    const out = pickWaypoints(pts, 3);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((p) => p.lat)).size).toBe(3);
    expect(out.map((p) => p.lat)).toEqual([...out.map((p) => p.lat)].sort((a, b) => a - b));
  });
});

describe('buildGoogleMapsUrl', () => {
  it('builds a driving navigation link with pipe-separated waypoints', () => {
    const url = new URL(buildGoogleMapsUrl({
      origin: { lat: 13.1, lng: 100.1 }, destination: { lat: 13.9, lng: 100.9 },
      waypoints: [{ lat: 13.3, lng: 100.3 }, { lat: 13.5, lng: 100.5 }],
    }));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('13.1,100.1');
    expect(url.searchParams.get('destination')).toBe('13.9,100.9');
    expect(url.searchParams.get('waypoints')).toBe('13.3,100.3|13.5,100.5');
    expect(url.searchParams.get('travelmode')).toBe('driving');
  });
  it('never emits more than 3 waypoints', () => {
    const wps = Array.from({ length: 8 }, (_, i) => ({ lat: 13 + i / 100, lng: 100 }));
    const url = new URL(buildGoogleMapsUrl({ origin: { lat: 13, lng: 100 }, destination: { lat: 14, lng: 100 }, waypoints: wps }));
    expect(url.searchParams.get('waypoints')!.split('|').length).toBeLessThanOrEqual(3);
  });
  it('omits waypoints when there are none', () => {
    const url = new URL(buildGoogleMapsUrl({ origin: { lat: 1, lng: 1 }, destination: { lat: 2, lng: 2 }, waypoints: [] }));
    expect(url.searchParams.has('waypoints')).toBe(false);
  });
});

it('builds a search link', () => {
  expect(buildGoogleMapsSearchUrl({ lat: 13.7, lng: 100.7 })).toBe('https://www.google.com/maps/search/?api=1&query=13.7%2C100.7');
});
