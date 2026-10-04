import { formatTtlTh, googleMapsLinkFor } from './routesHelpers';
import type { RouteView } from '../../state/routeViews';

const HOUR = 3_600_000;
it('formats the TTL window', () => {
  expect(formatTtlTh(3 * HOUR)).toBe('3 ชม.');
  expect(formatTtlTh(HOUR)).toBe('1 ชม.');
  expect(formatTtlTh(15 * 60_000)).toBe('15 นาที');
});

const origin = { lat: 1, lng: 2 };
const view = (state: 'ok' | 'unknown' | 'blocked', over: Partial<RouteView['route']> = {}, dest: RouteView['destination'] | null = { id: 'd', name: 'x', kind: 'city', lat: 3, lng: 4 }): RouteView => ({
  route: { id: 'r', name: 'r', destinationId: 'd', segmentIds: [], waypoints: [{ lat: 5, lng: 6 }], distanceM: 1, ...over },
  status: { state, blockedSegmentIds: [], unknownSegmentIds: [], hasConflict: false, oldestAsOf: 1 },
  destination: dest ?? undefined, blockedNames: [], unknownNames: [],
}) as RouteView;

describe('googleMapsLinkFor', () => {
  it('ok + valid => url with origin, destination, waypoints', () => {
    const u = googleMapsLinkFor(view('ok'), origin)!;
    expect(u).toContain('origin=1%2C2');
    expect(u).toContain('destination=3%2C4');
    expect(u).toContain('waypoints=5%2C6');
  });
  it('blocked/unknown => null', () => {
    expect(googleMapsLinkFor(view('blocked'), origin)).toBeNull();
    expect(googleMapsLinkFor(view('unknown'), origin)).toBeNull();
  });
  it('NaN waypoint / origin / missing destination => null', () => {
    expect(googleMapsLinkFor(view('ok', { waypoints: [{ lat: 5, lng: 6 }, { lat: NaN, lng: 6 }] }), origin)).toBeNull();
    expect(googleMapsLinkFor(view('ok'), { lat: NaN, lng: 2 })).toBeNull();
    expect(googleMapsLinkFor(view('ok', {}, null), origin)).toBeNull();
  });
});
