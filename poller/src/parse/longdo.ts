import { VILLAGE_CENTER } from '../../../src/core/config';
import { haversineM } from '../../../src/core/geo';
import { LONGDO_FLOOD_TYPE, LONGDO_RADIUS_M } from '../config';
import type { Incident } from '../types';

const thai = (s: unknown): Date | null => {
  if (typeof s !== 'string') return null;
  const d = new Date(`${s.replace(' ', 'T')}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function parseLongdo(json: unknown, now: Date): Incident[] {
  if (!Array.isArray(json)) return [];
  const out: Incident[] = [];
  for (const e of json as Array<Record<string, any>>) {
    if (String(e?.type) !== LONGDO_FLOOD_TYPE) continue;
    if (e.eid == null || e.latitude == null || e.longitude == null || e.latitude === '' || e.longitude === '') continue;
    const lat = Number(e.latitude);
    const lng = Number(e.longitude);
    const startAt = thai(e.start);
    const stopAt = thai(e.stop);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !startAt || !stopAt) continue;
    if (stopAt.getTime() <= now.getTime()) continue;
    if (haversineM(VILLAGE_CENTER, { lat, lng }) > LONGDO_RADIUS_M) continue;
    const sev = Number(e.severity ?? 0);
    out.push({ id: String(e.eid), title: String(e.title ?? ''), lat, lng, severity: Number.isFinite(sev) ? sev : 0, startAt, stopAt });
  }
  return out;
}
