import { WATCH } from '../config';
import type { Reading } from '../types';

export function parseDotNetDate(s: string | null | undefined): Date | null {
  const m = typeof s === 'string' ? /\/Date\((-?\d+)\)\//.exec(s) : null;
  if (!m) return null;
  const ms = Number(m[1]);
  if (ms < 0) return null; // .NET year-1 sentinel = "no reading"
  return new Date(ms);
}

// BMA uses -99 (and similar <= -99) as a "no gauge / no data" sentinel; never store it as a real reading.
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > -99 ? v : null);

export function parseBmaCanal(json: unknown): Reading[] {
  const stations = (json as { waterStation?: unknown[] } | null)?.waterStation;
  if (!Array.isArray(stations)) return [];
  const out: Reading[] = [];
  for (const s of stations as Array<{ water_station_info?: Record<string, any> }>) {
    const info = s?.water_station_info;
    const code = info?.water_code as string | undefined;
    if (!info || !code || !(WATCH.canal as readonly string[]).includes(code)) continue;
    const last = info.water_level_last ?? {};
    const observedAt = parseDotNetDate(last.site_timestamp);
    if (!observedAt) continue;
    for (const metric of ['wl_in', 'wl_out01'] as const) {
      const value = num(last[metric]);
      if (value === null) continue;
      out.push({
        source: 'bma_canal', stationId: code, stationName: String(info.water_shortname ?? code),
        lat: num(info.latitude), lng: num(info.longitude), metric, value, unit: 'm', observedAt,
      });
    }
  }
  return out;
}

const nonNeg = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n >= 0 ? n : null; // rainfall can't be negative: any negative is a sentinel
};

export function parseBmaRain(json: unknown): Reading[] {
  if (!Array.isArray(json)) return [];
  const out: Reading[] = [];
  for (const s of json as Array<Record<string, any>>) {
    const code = s?.rain_code as string | undefined;
    if (!code || !(WATCH.rain as readonly string[]).includes(code)) continue;
    const observedAt = parseDotNetDate(s.site_timestamp);
    if (!observedAt) continue;
    for (const metric of ['rf1hr', 'rf24hr'] as const) {
      const value = nonNeg(s[metric]);
      if (value === null) continue;
      out.push({
        source: 'bma_rain', stationId: code, stationName: String(s.rain_shortname ?? code),
        lat: num(s.latitude), lng: num(s.longitude), metric, value, unit: 'mm', observedAt,
      });
    }
  }
  return out;
}
