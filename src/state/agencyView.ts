import { freshness, gaugeState, trend, type GaugeState, type Trend } from '../core/agency';
import { COMMITTEE_NOTE_MAX_AGE_MS, PRIMARY_GAUGE, WARNING_MAX_AGE_MS } from '../core/config';
import type { AgencyReading, Snapshot, WarningRow } from '../data/types';

export interface GaugeView {
  stationId: string; name: string; source: string; value: number; unit: string; observedAt: number; ageMs: number; stale: boolean;
  trend: Trend; state: GaugeState; thresholds: { watch: number; danger: number } | null;
}
export interface RainCell { value: number; observedAt: number; stale: boolean }
/** unit is the unit as stored; null when missing or mixed across this station's rows. */
export interface RainView { stationId: string; name: string; unit: string | null; rf1hr: RainCell | null; rf24hr: RainCell | null; observedAt: number; stale: boolean }

const CANAL_METRICS: Record<string, string> = { bma_canal: 'wl_in', thaiwater: 'waterlevel_msl' };

export function agencyView(s: Snapshot, now: number): { primary: GaugeView | null; others: GaugeView[]; rain: RainView[] } {
  const maxAge = s.settings.agencyMaxAgeMs;
  const gauges: GaugeView[] = s.latest
    .filter((r) => CANAL_METRICS[r.source] === r.metric)
    .map((r) => {
      const { ageMs, stale } = freshness(r.observedAt, now, maxAge);
      const samples = s.recent.filter((x) => x.source === r.source && x.stationId === r.stationId && x.metric === r.metric).map((x) => ({ t: x.observedAt, v: x.value }));
      const thresholds = s.settings.gaugeThresholds[r.stationId] ?? null;
      return { stationId: r.stationId, name: r.stationName, source: r.source, value: r.value, unit: r.unit, observedAt: r.observedAt, ageMs, stale,
        trend: trend(samples, now), state: gaugeState(r.value, thresholds, stale), thresholds };
    });

  const rainRows = s.latest.filter((r) => r.source === 'bma_rain');
  const byStation = new Map<string, AgencyReading[]>();
  for (const r of rainRows) byStation.set(r.stationId, [...(byStation.get(r.stationId) ?? []), r]);
  const cell = (rows: AgencyReading[], metric: string): RainCell | null => {
    const r = rows.find((x) => x.metric === metric);
    return r ? { value: r.value, observedAt: r.observedAt, stale: freshness(r.observedAt, now, maxAge).stale } : null;
  };
  const rain: RainView[] = [...byStation.entries()].map(([id, rows]) => {
    const units = new Set(rows.map((r) => r.unit));
    const unit = units.size === 1 && rows[0]!.unit ? rows[0]!.unit : null;
    const rf1hr = cell(rows, 'rf1hr');
    const rf24hr = cell(rows, 'rf24hr');
    const finite = rows.map((r) => r.observedAt).filter(Number.isFinite);
    return {
      stationId: id, name: rows[0]!.stationName, unit, rf1hr, rf24hr,
      observedAt: finite.length ? Math.max(...finite) : NaN,
      stale: [rf1hr, rf24hr].some((c) => c?.stale ?? false) || !finite.length,
    };
  });

  return { primary: gauges.find((g) => g.stationId === PRIMARY_GAUGE) ?? null, others: gauges.filter((g) => g.stationId !== PRIMARY_GAUGE), rain };
}

export function visibleWarnings(s: Snapshot, now: number): WarningRow[] {
  return s.warnings.filter((w) => now - w.issuedAt <= WARNING_MAX_AGE_MS)
    .sort((a, b) => Number(b.mentionsBangkok) - Number(a.mentionsBangkok) || b.issuedAt - a.issuedAt);
}

export function committeeNote(s: Snapshot, target: 'wall' | 'drainage', now: number): { note: string; createdAt: number; stale: boolean } | null {
  const newest = s.feed.filter((f) => f.kind === 'general' && f.byCommittee && f.targetId === target).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!newest) return null;
  return { note: newest.note ?? '', createdAt: newest.createdAt, stale: !(now - newest.createdAt < COMMITTEE_NOTE_MAX_AGE_MS) };
}
