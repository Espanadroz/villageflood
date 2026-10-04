import { mapReportRow, parseSettings, mapReading } from './mappers';
import { TTL_MS, AGENCY_MAX_AGE_MS, VILLAGE_CENTER } from '../core/config';

const row = {
  id: 'r1', kind: 'road', target_id: 'seg1', value: 'small_car', nickname: 'สมชาย', created_at: '2026-10-04T07:00:00Z',
  location_ok: true, media_path: 'dev/a.jpg', media_type: 'image/jpeg', note: null, by_committee: false,
  confirmed_by_committee: false, confirmations: '2', lat: 1, lng: 2,
};

describe('mapReportRow', () => {
  const { report, feed } = mapReportRow(row, (p) => `https://m/${p}`);
  it('derives hasEvidence from media_path and parses time', () => {
    expect(report).toMatchObject({ id: 'r1', kind: 'road', targetId: 'seg1', hasEvidence: true, locationOk: true, createdAt: Date.parse('2026-10-04T07:00:00Z') });
  });
  it('builds the feed item with media url and numeric confirmations', () => {
    expect(feed).toMatchObject({ mediaUrl: 'https://m/dev/a.jpg', confirmations: 2, nickname: 'สมชาย' });
  });
  it('has no evidence when media was removed', () => {
    expect(mapReportRow({ ...row, media_path: null }, (p) => p).report.hasEvidence).toBe(false);
  });
});

describe('parseSettings', () => {
  it('falls back to defaults when keys are missing', () => {
    expect(parseSettings([])).toEqual({ ttlMs: { ...TTL_MS }, agencyMaxAgeMs: AGENCY_MAX_AGE_MS, gaugeThresholds: {}, origin: { ...VILLAGE_CENTER } });
  });
  it('reads committee overrides', () => {
    const s = parseSettings([
      { key: 'ttl_ms', value: { road: 1000, water_level: 2000, supply: 3000 } },
      { key: 'agency_max_age_ms', value: 5000 },
      { key: 'gauge_thresholds', value: { 'WL.STN.02': { watch: 0.5, danger: 0.8 } } },
      { key: 'origin', value: { lat: 13.1, lng: 100.2 } },
    ]);
    expect(s.ttlMs).toEqual({ road: 1000, water_level: 2000, supply: 3000 });
    expect(s.gaugeThresholds['WL.STN.02']).toEqual({ watch: 0.5, danger: 0.8 });
    expect(s.origin).toEqual({ lat: 13.1, lng: 100.2 });
  });
  it('drops invalid thresholds and non-positive TTLs', () => {
    const s = parseSettings([
      { key: 'ttl_ms', value: { road: -1, water_level: 'x', supply: 3000 } },
      { key: 'gauge_thresholds', value: { A: { watch: 0.9, danger: 0.5 }, B: { watch: 'a' }, C: null } },
    ]);
    expect(s.ttlMs).toEqual({ road: TTL_MS.road, water_level: TTL_MS.water_level, supply: 3000 });
    expect(s.gaugeThresholds).toEqual({});
  });
});

it('maps agency readings', () => {
  expect(mapReading({ source: 'bma_canal', station_id: 'WL.STN.02', station_name: 'x', lat: 1, lng: 2, metric: 'wl_in', value: 0.7, unit: 'm', observed_at: '2026-10-04T07:00:00Z' }))
    .toMatchObject({ stationId: 'WL.STN.02', observedAt: Date.parse('2026-10-04T07:00:00Z'), value: 0.7 });
});
