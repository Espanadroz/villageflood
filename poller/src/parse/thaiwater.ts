import { MAX_FUTURE_SKEW_MS } from '../../../src/core/config';
import { WATCH } from '../config';
import type { Reading } from '../types';

const coord = (v: unknown): number | null => {
  const n = v == null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseThaiWater(json: unknown, now: Date = new Date()): Reading[] {
  const data = (json as { waterlevel_data?: { data?: unknown[] } } | null)?.waterlevel_data?.data;
  if (!Array.isArray(data)) return [];
  const out: Reading[] = [];
  for (const r of data as Array<Record<string, any>>) {
    const name = r?.station?.tele_station_name?.th as string | undefined;
    if (!name || !WATCH.thaiwaterNameIncludes.some((n) => name.includes(n))) continue;
    const value = r.waterlevel_msl == null || r.waterlevel_msl === '' ? NaN : Number(r.waterlevel_msl);
    if (!Number.isFinite(value) || typeof r.waterlevel_datetime !== 'string') continue;
    if (r.station.id == null) continue;
    const observedAt = new Date(`${r.waterlevel_datetime.replace(' ', 'T')}:00+07:00`);
    if (Number.isNaN(observedAt.getTime())) continue;
    if (observedAt.getTime() - now.getTime() > MAX_FUTURE_SKEW_MS) continue; // future stamp: invalid, never "fresh"
    out.push({
      source: 'thaiwater', stationId: String(r.station.id), stationName: name,
      lat: coord(r.station.tele_station_lat), lng: coord(r.station.tele_station_long),
      metric: 'waterlevel_msl', value, unit: 'm MSL', observedAt,
    });
  }
  return out;
}
