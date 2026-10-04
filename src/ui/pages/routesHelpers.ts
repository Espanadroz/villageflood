import { buildGoogleMapsUrl } from '../../core/routes';
import type { LatLng } from '../../core/types';
import type { RouteView } from '../../state/routeViews';

export const isFiniteLL = (p: LatLng | undefined | null): p is LatLng =>
  !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export function formatTtlTh(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} นาที`;
  const h = ms / 3_600_000;
  return `${Number.isInteger(h) ? h : Math.round(h * 10) / 10} ชม.`;
}

/** Navigation link only for fully-ok routes with valid coordinates; never drops waypoints silently. */
export function googleMapsLinkFor(v: RouteView, origin: LatLng): string | null {
  if (v.status.state !== 'ok') return null;
  const dd = v.destination;
  if (!dd) return null;
  const destination = { lat: dd.lat, lng: dd.lng };
  if (!isFiniteLL(origin) || !isFiniteLL(destination) || !v.route.waypoints.every(isFiniteLL)) return null;
  return buildGoogleMapsUrl({ origin, destination, waypoints: v.route.waypoints });
}
