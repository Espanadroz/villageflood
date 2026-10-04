import { resolveRoad, resolveWaterLevel, resolveSupply, resolveRoadSegments, isEffective } from './status';
import { HOUR } from './config';
import type { Report } from './types';

const NOW = 1_000_000_000_000;
const TTL = 3 * HOUR;
let n = 0;
const rep = (o: Partial<Report> = {}): Report => ({
  id: `r${++n}`, kind: 'road', targetId: 'seg1', value: 'small_car', createdAt: NOW - 10 * 60_000,
  hasEvidence: true, locationOk: true, byCommittee: false, confirmedByCommittee: false, ...o,
});

describe('resolveRoad', () => {
  it('is unknown with no reports', () => {
    expect(resolveRoad([], NOW, TTL)).toEqual({ value: 'unknown', asOf: null, conflict: false, basisReportId: null });
  });
  it('is unknown once the only report has expired', () => {
    expect(resolveRoad([rep({ createdAt: NOW - TTL - 1 })], NOW, TTL).value).toBe('unknown');
  });
  it('uses a single valid report and records its time', () => {
    const r = rep({ value: 'dry' });
    expect(resolveRoad([r], NOW, TTL)).toMatchObject({ value: 'dry', asOf: r.createdAt, conflict: false, basisReportId: r.id });
  });
  it('shows the worse status and flags conflict when valid reports disagree', () => {
    const res = resolveRoad([rep({ value: 'dry' }), rep({ value: 'high_clearance' })], NOW, TTL);
    expect(res.value).toBe('high_clearance');
    expect(res.conflict).toBe(true);
  });
  it('ignores a passable claim that has no evidence', () => {
    expect(resolveRoad([rep({ value: 'small_car', hasEvidence: false })], NOW, TTL).value).toBe('unknown');
  });
  it('accepts impassable without evidence', () => {
    expect(resolveRoad([rep({ value: 'impassable', hasEvidence: false })], NOW, TTL).value).toBe('impassable');
  });
  it('ignores a report whose location does not match, unless a committee member confirmed it', () => {
    expect(resolveRoad([rep({ locationOk: false })], NOW, TTL).value).toBe('unknown');
    expect(resolveRoad([rep({ locationOk: false, confirmedByCommittee: true })], NOW, TTL).value).toBe('small_car');
  });
  it('ignores unrecognised values', () => {
    expect(resolveRoad([rep({ value: 'toString' })], NOW, TTL).value).toBe('unknown');
  });
  it('lets the newest committee report override older worse resident reports', () => {
    const res = resolveRoad([
      rep({ value: 'impassable', createdAt: NOW - 30 * 60_000 }),
      rep({ value: 'small_car', byCommittee: true, createdAt: NOW - 5 * 60_000 }),
    ], NOW, TTL);
    expect(res).toMatchObject({ value: 'small_car', conflict: false });
  });
  it('still shows a worse resident report that is newer than the committee report', () => {
    const res = resolveRoad([
      rep({ value: 'small_car', byCommittee: true, createdAt: NOW - 30 * 60_000 }),
      rep({ value: 'impassable', createdAt: NOW - 5 * 60_000 }),
    ], NOW, TTL);
    expect(res).toMatchObject({ value: 'impassable', conflict: true });
  });
});

describe('isEffective', () => {
  it('committee reports need no location match but still need evidence for passable claims', () => {
    expect(isEffective(rep({ byCommittee: true, locationOk: false }), NOW, TTL)).toBe(true);
    expect(isEffective(rep({ byCommittee: true, hasEvidence: false }), NOW, TTL)).toBe(false);
  });
});

describe('resolveWaterLevel', () => {
  it('takes the highest recent level', () => {
    const base = { kind: 'water_level' as const, targetId: 'mark1' };
    const res = resolveWaterLevel([rep({ ...base, value: '1' }), rep({ ...base, value: '3' })], NOW, 2 * HOUR);
    expect(res).toMatchObject({ value: '3', conflict: true });
  });
  it('expires after its own ttl', () => {
    const r = rep({ kind: 'water_level', targetId: 'mark1', value: '2', createdAt: NOW - 2 * HOUR - 1 });
    expect(resolveWaterLevel([r], NOW, 2 * HOUR).value).toBe('unknown');
  });
});

describe('resolveSupply', () => {
  it('newest report wins', () => {
    const base = { kind: 'supply' as const, targetId: 'p1', hasEvidence: false };
    const res = resolveSupply([
      rep({ ...base, value: 'open', createdAt: NOW - 60 * 60_000 }),
      rep({ ...base, value: 'out_of_stock', createdAt: NOW - 10 * 60_000 }),
    ], NOW, 12 * HOUR);
    expect(res.value).toBe('out_of_stock');
  });
  it('is unknown after 12 hours', () => {
    const r = rep({ kind: 'supply', targetId: 'p1', value: 'open', createdAt: NOW - 12 * HOUR - 1 });
    expect(resolveSupply([r], NOW, 12 * HOUR).value).toBe('unknown');
  });
});

describe('resolveRoadSegments', () => {
  it('returns an entry for every segment, unknown when no reports', () => {
    const out = resolveRoadSegments([rep({ targetId: 'a', value: 'dry' })], ['a', 'b'], NOW, TTL);
    expect(out.a?.value).toBe('dry');
    expect(out.b?.value).toBe('unknown');
  });
});
