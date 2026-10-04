import { GOOGLE_MAPS_MAX_WAYPOINTS } from './config';
import type { LatLng, Resolved, RoadStatus, VehicleClass } from './types';

export interface RouteDef { id: string; name: string; destinationId: string; segmentIds: string[]; waypoints: LatLng[]; distanceM: number }
export type RouteState = 'ok' | 'unknown' | 'blocked';
export interface RouteStatus {
  state: RouteState; blockedSegmentIds: string[]; unknownSegmentIds: string[]; hasConflict: boolean; oldestAsOf: number | null;
}

export function isPassable(vehicle: VehicleClass, status: RoadStatus): boolean {
  if (status === 'dry' || status === 'small_car') return true;
  if (status === 'high_clearance') return vehicle === 'high_clearance';
  return false;
}

export function routeStatus(route: RouteDef, segments: Record<string, Resolved<RoadStatus>>, vehicle: VehicleClass): RouteStatus {
  const blocked: string[] = [];
  const unknown: string[] = [];
  let conflict = false;
  let oldest: number | null = null;
  for (const id of route.segmentIds) {
    const s = segments[id];
    if (!s || s.value === 'unknown') { unknown.push(id); continue; }
    if (s.conflict) conflict = true;
    if (s.asOf !== null) oldest = oldest === null ? s.asOf : Math.min(oldest, s.asOf);
    if (!isPassable(vehicle, s.value)) blocked.push(id);
  }
  const state: RouteState = blocked.length ? 'blocked' : unknown.length || route.segmentIds.length === 0 ? 'unknown' : 'ok';
  return { state, blockedSegmentIds: blocked, unknownSegmentIds: unknown, hasConflict: conflict, oldestAsOf: oldest };
}

const STATE_ORDER: Record<RouteState, number> = { ok: 0, unknown: 1, blocked: 2 };

export function rankRoutes<T extends { route: RouteDef; status: RouteStatus }>(items: T[]): T[] {
  return [...items].sort((a, b) => STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state] || a.route.distanceM - b.route.distanceM);
}

export function pickWaypoints(points: LatLng[], max = GOOGLE_MAPS_MAX_WAYPOINTS): LatLng[] {
  if (points.length <= max) return points;
  const idx = new Set<number>();
  for (let i = 1; i <= max; i++) idx.add(Math.min(points.length - 1, Math.floor((i * points.length) / (max + 1))));
  return [...idx].sort((a, b) => a - b).map((i) => points[i]!);
}

const ll = (p: LatLng) => `${p.lat},${p.lng}`;

export function buildGoogleMapsUrl(o: { origin: LatLng; destination: LatLng; waypoints: LatLng[] }): string {
  const q = new URLSearchParams({ api: '1', origin: ll(o.origin), destination: ll(o.destination) });
  const wps = pickWaypoints(o.waypoints);
  if (wps.length) q.set('waypoints', wps.map(ll).join('|'));
  q.set('travelmode', 'driving');
  q.set('dir_action', 'navigate');
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

export function buildGoogleMapsSearchUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: ll(p) }).toString()}`;
}
