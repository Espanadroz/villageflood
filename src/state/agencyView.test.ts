import { agencyView, visibleWarnings, committeeNote } from './agencyView';
import type { AgencyReading, FeedItem, Snapshot } from '../data/types';
import { HOUR, MINUTE } from '../core/config';

const NOW = 1_000_000_000_000;
const R = (o: Partial<AgencyReading>): AgencyReading => ({
  source: 'bma_canal', stationId: 'WL.STN.02', stationName: 'ค.สองต้นนุ่น', lat: 0, lng: 0, metric: 'wl_in', value: 0.7, unit: 'm', observedAt: NOW - 5 * MINUTE, ...o,
});
const snap = (latest: AgencyReading[], recent: AgencyReading[] = latest, extra: Partial<Snapshot> = {}): Snapshot => ({
  latest, recent, warnings: [], feed: [],
  settings: { ttlMs: { road: 0, water_level: 0, supply: 12 * HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
  ...extra,
} as unknown as Snapshot);

describe('agencyView', () => {
  it('finds the primary gauge, uncalibrated when no thresholds are set', () => {
    const v = agencyView(snap([R({})]), NOW);
    expect(v.primary).toMatchObject({ stationId: 'WL.STN.02', value: 0.7, stale: false, state: 'uncalibrated', thresholds: null });
  });
  it('reports null primary when the gauge has no reading at all', () => {
    expect(agencyView(snap([]), NOW).primary).toBeNull();
  });
  it('flags stale readings and never gives them a colour state', () => {
    const v = agencyView(snap([R({ observedAt: NOW - 3 * HOUR })], undefined, { settings: { ttlMs: {}, agencyMaxAgeMs: HOUR, gaugeThresholds: { 'WL.STN.02': { watch: 0.5, danger: 0.9 } }, origin: { lat: 0, lng: 0 } } as any }), NOW);
    expect(v.primary).toMatchObject({ stale: true, state: 'stale' });
  });
  it('treats a non-finite observedAt as stale, not fresh', () => {
    const v = agencyView(snap([R({ observedAt: NaN, value: 0.95 })], undefined, { settings: { ttlMs: {}, agencyMaxAgeMs: HOUR, gaugeThresholds: { 'WL.STN.02': { watch: 0.5, danger: 0.9 } }, origin: { lat: 0, lng: 0 } } as any }), NOW);
    expect(v.primary).toMatchObject({ stale: true, state: 'stale' });
  });
  it('applies committee thresholds to fresh readings', () => {
    const v = agencyView(snap([R({ value: 0.95 })], undefined, { settings: { ttlMs: {}, agencyMaxAgeMs: HOUR, gaugeThresholds: { 'WL.STN.02': { watch: 0.5, danger: 0.9 } }, origin: { lat: 0, lng: 0 } } as any }), NOW);
    expect(v.primary?.state).toBe('danger');
  });
  it('computes the trend from recent samples', () => {
    const recent = [R({ value: 0.5, observedAt: NOW - 60 * MINUTE }), R({ value: 0.6, observedAt: NOW - 30 * MINUTE }), R({ value: 0.72, observedAt: NOW - 5 * MINUTE })];
    expect(agencyView(snap([recent[2]!], recent), NOW).primary?.trend).toBe('rising');
  });
  it('lists other canal gauges and merges rain metrics per station', () => {
    const v = agencyView(snap([
      R({}), R({ stationId: 'WL.STN.01', stationName: 'อีกจุด' }),
      R({ source: 'bma_rain', stationId: 'RF.MBR.03', stationName: 'ฝน', metric: 'rf1hr', value: 27, unit: 'mm' }),
      R({ source: 'bma_rain', stationId: 'RF.MBR.03', stationName: 'ฝน', metric: 'rf24hr', value: 30, unit: 'mm' }),
    ]), NOW);
    expect(v.others.map((g) => g.stationId)).toEqual(['WL.STN.01']);
    expect(v.rain).toEqual([expect.objectContaining({ stationId: 'RF.MBR.03', rf1hr: 27, rf24hr: 30, stale: false })]);
  });
});

describe('visibleWarnings', () => {
  const w = (id: string, hoursAgo: number, bkk: boolean) => ({ id, title: id, body: '', url: '', issuedAt: NOW - hoursAgo * HOUR, mentionsBangkok: bkk });
  it('hides warnings older than 48h and sorts Bangkok mentions first', () => {
    const out = visibleWarnings(snap([], [], { warnings: [w('old', 60, true), w('other', 2, false), w('bkk', 5, true)] }), NOW);
    expect(out.map((x) => x.id)).toEqual(['bkk', 'other']);
  });
});

describe('committeeNote', () => {
  const f = (o: Partial<FeedItem>): FeedItem => ({
    id: Math.random().toString(), kind: 'general', targetId: 'wall', value: 'note', nickname: 'กรรมการ', createdAt: NOW - HOUR, mediaUrl: null, mediaType: null,
    note: 'น้ำเสมอขีด 2', byCommittee: true, confirmedByCommittee: false, confirmations: 0, locationOk: true, ...o,
  });
  it('returns the newest committee note for the target', () => {
    const s = snap([], [], { feed: [f({ createdAt: NOW - 3 * HOUR, note: 'เก่า' }), f({ note: 'ใหม่' }), f({ targetId: 'drainage', note: 'อื่น' })] });
    expect(committeeNote(s, 'wall', NOW)).toEqual({ note: 'ใหม่', createdAt: NOW - HOUR, stale: false });
  });
  it('ignores resident messages and flags notes older than 12h as stale', () => {
    const s = snap([], [], { feed: [f({ byCommittee: false, note: 'ลูกบ้านพิมพ์' }), f({ createdAt: NOW - 13 * HOUR })] });
    expect(committeeNote(s, 'wall', NOW)).toMatchObject({ note: 'น้ำเสมอขีด 2', stale: true });
  });
  it('returns null when nothing was ever posted', () => expect(committeeNote(snap([], [], { feed: [] }), 'drainage', NOW)).toBeNull());
});
