import { freshness, trend, gaugeState } from './agency';
import { MINUTE, HOUR } from './config';

const NOW = 1_000_000_000_000;

describe('freshness', () => {
  it('is fresh within max age', () => expect(freshness(NOW - 10 * MINUTE, NOW, HOUR)).toEqual({ ageMs: 10 * MINUTE, stale: false }));
  it('is stale beyond max age', () => expect(freshness(NOW - 61 * MINUTE, NOW, HOUR).stale).toBe(true));
  it('never reports negative age (clock skew)', () => expect(freshness(NOW + 5000, NOW, HOUR).ageMs).toBe(0));
});

describe('trend', () => {
  const s = (minAgo: number, v: number) => ({ t: NOW - minAgo * MINUTE, v });
  it('rising', () => expect(trend([s(60, 0.5), s(30, 0.6), s(0, 0.72)], NOW)).toBe('rising'));
  it('falling', () => expect(trend([s(60, 0.9), s(0, 0.7)], NOW)).toBe('falling'));
  it('steady within epsilon', () => expect(trend([s(60, 0.7), s(0, 0.71)], NOW)).toBe('steady'));
  it('unknown with a single sample', () => expect(trend([s(0, 0.7)], NOW)).toBe('unknown'));
  it('unknown when samples span less than 20 minutes', () => expect(trend([s(10, 0.5), s(0, 0.9)], NOW)).toBe('unknown'));
  it('ignores samples older than the window', () => expect(trend([s(400, 0.1), s(0, 0.7)], NOW)).toBe('unknown'));
});

describe('gaugeState', () => {
  const th = { watch: 0.5, danger: 0.8 };
  it('is uncalibrated without thresholds (no colour)', () => expect(gaugeState(2, null, false)).toBe('uncalibrated'));
  it('is stale when data is stale, regardless of value', () => expect(gaugeState(2, th, true)).toBe('stale'));
  it('classifies by threshold', () => {
    expect(gaugeState(0.4, th, false)).toBe('normal');
    expect(gaugeState(0.5, th, false)).toBe('watch');
    expect(gaugeState(0.8, th, false)).toBe('danger');
  });
});
