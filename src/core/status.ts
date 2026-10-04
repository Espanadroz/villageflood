import { requiresEvidence } from './evidence';
import type { Report, Resolved, RoadStatus, SupplyStatus } from './types';

export const ROAD_SEVERITY: Record<RoadStatus, number> = { dry: 0, small_car: 1, high_clearance: 2, impassable: 3 };
const SUPPLY_VALUES: readonly string[] = ['open', 'closed', 'out_of_stock', 'unreachable'];

const sev = (m: Record<string, number>) => (v: string): number | undefined => (Object.hasOwn(m, v) ? m[v] : undefined);
const levelSeverity = (v: string): number | undefined => (/^\d+$/.test(v) ? Number(v) : undefined);

function unknown<V extends string>(): Resolved<V> {
  return { value: 'unknown', asOf: null, conflict: false, basisReportId: null };
}

/** A report counts toward status only if unexpired, evidenced when required, and location-matched (or committee-vouched). */
export function isEffective(r: Report, now: number, ttlMs: number): boolean {
  if (now - r.createdAt >= ttlMs) return false;
  if (requiresEvidence(r.kind, r.value) && !r.hasEvidence) return false;
  if (!r.locationOk && !r.byCommittee && !r.confirmedByCommittee) return false;
  return true;
}

function resolveWorst<V extends string>(
  reports: Report[], now: number, ttlMs: number, severity: (v: string) => number | undefined,
): Resolved<V> {
  const valid = reports.filter((r) => severity(r.value) !== undefined && isEffective(r, now, ttlMs));
  if (valid.length === 0) return unknown<V>();

  const committee = valid.filter((r) => r.byCommittee).sort((a, b) => b.createdAt - a.createdAt)[0];
  // Newest committee report is authoritative, except a *newer* resident report is still considered (worse wins).
  const pool = committee ? [committee, ...valid.filter((r) => !r.byCommittee && r.createdAt > committee.createdAt)] : valid;

  const top = Math.max(...pool.map((r) => severity(r.value)!));
  const worst = pool.filter((r) => severity(r.value) === top);
  const newest = worst.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return {
    value: newest.value as V,
    asOf: newest.createdAt,
    conflict: new Set(pool.map((r) => r.value)).size > 1,
    basisReportId: newest.id,
  };
}

export const resolveRoad = (reports: Report[], now: number, ttlMs: number): Resolved<RoadStatus> =>
  resolveWorst<RoadStatus>(reports, now, ttlMs, sev(ROAD_SEVERITY));

export const resolveWaterLevel = (reports: Report[], now: number, ttlMs: number): Resolved<string> =>
  resolveWorst<string>(reports, now, ttlMs, levelSeverity);

export function resolveSupply(reports: Report[], now: number, ttlMs: number): Resolved<SupplyStatus> {
  const valid = reports.filter((r) => SUPPLY_VALUES.includes(r.value) && isEffective(r, now, ttlMs));
  if (valid.length === 0) return unknown<SupplyStatus>();
  const newest = valid.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return { value: newest.value as SupplyStatus, asOf: newest.createdAt, conflict: false, basisReportId: newest.id };
}

export function resolveRoadSegments(
  reports: Report[], segmentIds: string[], now: number, ttlMs: number,
): Record<string, Resolved<RoadStatus>> {
  const out: Record<string, Resolved<RoadStatus>> = {};
  for (const id of segmentIds) {
    out[id] = resolveRoad(reports.filter((r) => r.kind === 'road' && r.targetId === id), now, ttlMs);
  }
  return out;
}
