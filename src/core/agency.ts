import { HOUR, MINUTE } from './config';

export function freshness(observedAt: number, now: number, maxAgeMs: number) {
  if (!Number.isFinite(observedAt) || !Number.isFinite(now)) {
    return { ageMs: Number.POSITIVE_INFINITY, stale: true };
  }
  if (!Number.isFinite(maxAgeMs) && maxAgeMs !== Number.POSITIVE_INFINITY) {
    return { ageMs: Number.POSITIVE_INFINITY, stale: true };
  }
  const ageMs = Math.max(0, now - observedAt);
  return { ageMs, stale: ageMs > maxAgeMs };
}

export interface Sample { t: number; v: number }
export type Trend = 'rising' | 'falling' | 'steady' | 'unknown';

export function trend(samples: Sample[], now: number, opts: { windowMs?: number; epsilon?: number; minSpanMs?: number } = {}): Trend {
  const { windowMs = 3 * HOUR, epsilon = 0.02, minSpanMs = 20 * MINUTE } = opts;
  const inWindow = samples
    .filter((x) => Number.isFinite(x.t) && Number.isFinite(x.v) && x.t <= now && now - x.t <= windowMs)
    .sort((a, b) => a.t - b.t);
  if (inWindow.length < 2) return 'unknown';
  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;
  if (last.t - first.t < minSpanMs) return 'unknown';
  const delta = last.v - first.v;
  if (delta > epsilon) return 'rising';
  if (delta < -epsilon) return 'falling';
  return 'steady';
}

export type GaugeState = 'uncalibrated' | 'stale' | 'normal' | 'watch' | 'danger';

export function gaugeState(value: number, thresholds: { watch: number; danger: number } | null, stale: boolean): GaugeState {
  if (!thresholds) return 'uncalibrated';
  if (stale || !Number.isFinite(value)) return 'stale';
  if (value >= thresholds.danger) return 'danger';
  if (value >= thresholds.watch) return 'watch';
  return 'normal';
}
