import { haversineM } from '../core/geo';
import type { LatLng, Resolved, SupplyStatus } from '../core/types';
import type { PlaceCategory, PlaceRow, Snapshot } from '../data/types';
import { derive } from './derive';

export interface SupplyView { place: PlaceRow; status: Resolved<SupplyStatus>; distanceM: number }
export const CATEGORY_LABEL_TH: Record<PlaceCategory, string> = { food: 'ร้านอาหาร', market: 'ตลาด', store: 'ร้านสะดวกซื้อ/ซูเปอร์', fuel: 'ปั๊มน้ำมัน', hospital: 'โรงพยาบาล/คลินิก' };

const ORDER: Record<SupplyStatus | 'unknown', number> = { open: 0, out_of_stock: 1, closed: 2, unreachable: 3, unknown: 4 };

/** Place coordinates as LatLng, or null when missing/non-finite. */
export function placeLatLng(p: PlaceRow): LatLng | null {
  const c = p.geojson?.coordinates;
  if (!Array.isArray(c)) return null;
  const [lng, lat] = c;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function supplyViews(s: Snapshot, now: number, category: PlaceCategory | null): SupplyView[] {
  const { placeStates } = derive(s, now);
  return s.places
    .filter((p) => category === null || p.category === category)
    .map((place) => {
      const ll = placeLatLng(place);
      const d = ll ? haversineM(s.settings.origin, ll) : Infinity;
      return { place, status: placeStates[place.id] ?? { value: 'unknown' as const, asOf: null, conflict: false, basisReportId: null }, distanceM: Number.isFinite(d) ? d : Infinity };
    })
    .sort((a, b) => {
      const o = ORDER[a.status.value] - ORDER[b.status.value];
      if (o !== 0) return o;
      if (a.distanceM === b.distanceM) return 0; // also handles Infinity vs Infinity
      return a.distanceM < b.distanceM ? -1 : 1;
    });
}
