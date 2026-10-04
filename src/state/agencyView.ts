import { freshness, gaugeState, trend, type GaugeState, type Trend } from '../core/agency';
import { HOUR, PRIMARY_GAUGE, TTL_MS, WARNING_MAX_AGE_MS } from '../core/config';
import type { AgencyReading, Snapshot, WarningRow } from '../data/types';

export interface GaugeView {
  stationId: string; name: string; source: string; value: number; unit: string; observedAt: number; ageMs: number; stale: boolean;
  trend: Trend; state: GaugeState; thresholds: { watch: number; danger: number } | null;
}
export interface RainView { stationId: string; name: string; rf1hr: number | null; rf24hr: number | null; observedAt: number; stale: boolean }

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
  const rain: RainView[] = [...byStation.entries()].map(([id, rows]) => {
    const newest = Math.max(...rows.map((r) => r.observedAt));
    return {
      stationId: id, name: rows[0]!.stationName,
      rf1hr: rows.find((r) => r.metric === 'rf1hr')?.value ?? null, rf24hr: rows.find((r) => r.metric === 'rf24hr')?.value ?? null,
      observedAt: newest, stale: freshness(newest, now, maxAge).stale,
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
  return { note: newest.note ?? '', createdAt: newest.createdAt, stale: now - newest.createdAt > Math.max(s.settings.ttlMs.supply || TTL_MS.supply, HOUR) };
}
