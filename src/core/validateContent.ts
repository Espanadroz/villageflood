import { GOOGLE_MAPS_MAX_WAYPOINTS, VILLAGE_CENTER } from './config';
import { haversineM } from './geo';
import type { LatLng } from './types';

const MAX_FROM_VILLAGE_M = 30_000;
const near = (lng: number, lat: number) => haversineM(VILLAGE_CENTER, { lat, lng }) <= MAX_FROM_VILLAGE_M;
const isPos = (c: unknown): c is [number, number] =>
  Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]);

export function validateSegmentGeoJSON(g: any): string[] {
  const errs: string[] = [];
  if (g?.type !== 'LineString') return ['ต้องเป็น LineString'];
  if (!Array.isArray(g.coordinates) || g.coordinates.length < 2) errs.push('ต้องมีอย่างน้อย 2 จุด');
  else if (!g.coordinates.every(isPos)) errs.push('พิกัดไม่ถูกต้อง');
  else if (g.coordinates.some(([lng, lat]: [number, number]) => !near(lng, lat))) errs.push('มีพิกัดที่ไกลจากหมู่บ้านเกิน 30 กม. (ตรวจว่าไม่ได้สลับ lat/lng — GeoJSON เรียงเป็น [lng, lat])');
  return errs;
}

export function validatePointGeoJSON(g: any): string[] {
  if (g?.type !== 'Point') return ['ต้องเป็น Point'];
  if (!isPos(g.coordinates)) return ['พิกัดไม่ถูกต้อง'];
  return near(g.coordinates[0], g.coordinates[1]) ? [] : ['พิกัดอยู่ไกลจากหมู่บ้านเกิน 30 กม. (GeoJSON เรียงเป็น [lng, lat])'];
}

export function validateRouteInput(r: { segmentIds: string[]; waypoints: LatLng[]; distanceM: number }, known: string[]): string[] {
  const errs: string[] = [];
  if (r.segmentIds.length === 0) errs.push('ต้องมีอย่างน้อย 1 ช่วงถนน');
  const missing = r.segmentIds.filter((id) => !known.includes(id));
  if (missing.length) errs.push(`ไม่พบช่วงถนน: ${missing.join(', ')}`);
  if (r.waypoints.length > GOOGLE_MAPS_MAX_WAYPOINTS) errs.push(`จุดแวะได้ไม่เกิน ${GOOGLE_MAPS_MAX_WAYPOINTS} จุด`);
  if (!(r.distanceM > 0)) errs.push('ระยะทางต้องมากกว่า 0');
  return errs;
}

export function validateWaterLevels(levels: any): string[] {
  if (!Array.isArray(levels) || levels.length === 0) return ['ต้องมีอย่างน้อย 1 ระดับ'];
  const errs: string[] = [];
  const nums = levels.map((l) => l?.level);
  if (new Set(nums).size !== nums.length) errs.push('หมายเลขระดับซ้ำกัน');
  if (!nums.every((n) => Number.isInteger(n) && n > 0)) errs.push('หมายเลขระดับต้องเป็นจำนวนเต็มบวก');
  if (!levels.every((l) => typeof l?.label === 'string' && l.label.trim())) errs.push('ทุกระดับต้องมีชื่อ');
  return errs;
}

export type ContentEntity = 'segments' | 'water_marks' | 'places' | 'destinations' | 'routes';
export const CONTENT_ENTITIES: ContentEntity[] = ['segments', 'water_marks', 'places', 'destinations', 'routes'];
const PLACE_CATEGORIES = ['food', 'market', 'store', 'fuel', 'hospital'];

/** Validates one row of any content table (shared by the admin editor and scripts/import-geo.mjs). */
export function validateContentRow(entity: ContentEntity, row: any, knownSegmentIds: string[]): string[] {
  if (!row || typeof row !== 'object' || !row.id || !row.name) return ['ต้องมี id และ name'];
  if (entity === 'segments') return validateSegmentGeoJSON(row.geojson);
  if (entity === 'places') return [...validatePointGeoJSON(row.geojson), ...(PLACE_CATEGORIES.includes(row.category) ? [] : ['category ไม่ถูกต้อง'])];
  if (entity === 'water_marks') return [...validatePointGeoJSON(row.geojson), ...validateWaterLevels(row.levels)];
  if (entity === 'routes') {
    if (!Array.isArray(row.segment_ids) || !Array.isArray(row.waypoints ?? [])) return ['segment_ids และ waypoints ต้องเป็น array'];
    return validateRouteInput({ segmentIds: row.segment_ids, waypoints: row.waypoints ?? [], distanceM: row.distance_m }, knownSegmentIds);
  }
  return typeof row.lat === 'number' && typeof row.lng === 'number' ? [] : ['ต้องมี lat และ lng'];
}
