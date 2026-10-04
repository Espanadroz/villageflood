import { AGENCY_MAX_AGE_MS, TTL_MS, VILLAGE_CENTER } from '../core/config';
import type { Report, ReportKind } from '../core/types';
import type { AgencyReading, AppSettings, FeedItem } from './types';

export interface ReportRow {
  id: string; kind: string; target_id: string; value: string; nickname: string; created_at: string;
  location_ok: boolean; media_path: string | null; media_type: string | null; note: string | null;
  by_committee: boolean; confirmed_by_committee: boolean; confirmations: number | string;
}

export function mapReportRow(row: ReportRow, mediaUrlFn: (path: string) => string): { report: Report; feed: FeedItem } {
  const createdAt = Date.parse(row.created_at);
  const kind = row.kind as ReportKind;
  return {
    report: {
      id: row.id, kind, targetId: row.target_id, value: row.value, createdAt,
      hasEvidence: !!row.media_path, locationOk: row.location_ok,
      byCommittee: row.by_committee, confirmedByCommittee: row.confirmed_by_committee,
    },
    feed: {
      id: row.id, kind, targetId: row.target_id, value: row.value, nickname: row.nickname, createdAt,
      mediaUrl: row.media_path ? mediaUrlFn(row.media_path) : null, mediaType: row.media_type, note: row.note,
      byCommittee: row.by_committee, confirmedByCommittee: row.confirmed_by_committee,
      confirmations: Number(row.confirmations ?? 0), locationOk: row.location_ok,
    },
  };
}

const posNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function parseSettings(rows: { key: string; value: unknown }[]): AppSettings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value as any;
  const ttl = get('ttl_ms') ?? {};
  const thresholdsRaw = get('gauge_thresholds') ?? {};
  const gaugeThresholds: AppSettings['gaugeThresholds'] = {};
  for (const [station, t] of Object.entries(thresholdsRaw as Record<string, any>)) {
    if (t && typeof t.watch === 'number' && typeof t.danger === 'number' && t.watch < t.danger) {
      gaugeThresholds[station] = { watch: t.watch, danger: t.danger };
    }
  }
  const o = get('origin');
  const validOrigin = o && typeof o.lat === 'number' && typeof o.lng === 'number';
  return {
    ttlMs: {
      road: posNum(ttl.road) ?? TTL_MS.road,
      water_level: posNum(ttl.water_level) ?? TTL_MS.water_level,
      supply: posNum(ttl.supply) ?? TTL_MS.supply,
    },
    agencyMaxAgeMs: posNum(get('agency_max_age_ms')) ?? AGENCY_MAX_AGE_MS,
    gaugeThresholds,
    origin: validOrigin ? { lat: o.lat, lng: o.lng } : { ...VILLAGE_CENTER },
  };
}

export function mapReading(r: Record<string, any>): AgencyReading {
  return {
    source: r.source, stationId: r.station_id, stationName: r.station_name, lat: r.lat, lng: r.lng,
    metric: r.metric, value: Number(r.value), unit: r.unit, observedAt: Date.parse(r.observed_at),
  };
}
