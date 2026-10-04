import { resolveRoadSegments, resolveSupply, resolveWaterLevel } from '../core/status';
import type { Resolved, RoadStatus, SupplyStatus } from '../core/types';
import type { Snapshot } from '../data/types';

export interface Derived {
  segmentStates: Record<string, Resolved<RoadStatus>>;
  markStates: Record<string, Resolved<string>>;
  placeStates: Record<string, Resolved<SupplyStatus>>;
}

export function derive(s: Snapshot, now: number): Derived {
  const { ttlMs } = s.settings;
  const segmentStates = resolveRoadSegments(s.reports, s.segments.map((x) => x.id), now, ttlMs.road);
  const markStates: Derived['markStates'] = {};
  for (const m of s.marks) markStates[m.id] = resolveWaterLevel(s.reports.filter((r) => r.kind === 'water_level' && r.targetId === m.id), now, ttlMs.water_level);
  const placeStates: Derived['placeStates'] = {};
  for (const p of s.places) placeStates[p.id] = resolveSupply(s.reports.filter((r) => r.kind === 'supply' && r.targetId === p.id), now, ttlMs.supply);
  return { segmentStates, markStates, placeStates };
}
