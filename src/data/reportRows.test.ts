import { FEED_LIMIT, mergeReportRows, STATUS_LIMIT } from './reportRows';
import type { ReportRow } from './mappers';

const r = (id: string, kind: string, minutesAgo: number): ReportRow => ({
  id, kind, target_id: 't', value: kind === 'general' ? 'note' : 'impassable', nickname: 'n',
  created_at: new Date(Date.UTC(2026, 9, 4, 12, 0) - minutesAgo * 60_000).toISOString(),
  location_ok: true, media_path: null, media_type: null, note: null, by_committee: false, confirmed_by_committee: false, confirmations: 0,
});

it('uses the documented limits', () => { expect(STATUS_LIMIT).toBe(5000); expect(FEED_LIMIT).toBe(200); });

it('merges status rows and general notes newest first for reports and feed', () => {
  const out = mergeReportRows({ status: [r('s1', 'road', 1), r('s2', 'road', 30)], statusCount: 2, general: [r('g1', 'general', 10)] });
  expect(out.rows.map((x) => x.id)).toEqual(['s1', 'g1', 's2']);
  expect(out.feedRows.map((x) => x.id)).toEqual(['s1', 'g1', 's2']);
  expect(out.statusTruncated).toBe(false);
});

it('general-note spam can never push an in-TTL status row out of reports', () => {
  const spam = Array.from({ length: 200 }, (_, i) => r(`g${i}`, 'general', i * 0.01));
  const old = r('impassable-2h', 'road', 120);
  const out = mergeReportRows({ status: [r('small', 'road', 5), old], statusCount: 2, general: spam });
  expect(out.rows.some((x) => x.id === 'impassable-2h')).toBe(true);
  expect(out.feedRows).toHaveLength(FEED_LIMIT);
});

it('drops general rows that came back in the status list and status-kind rows from the general list', () => {
  const out = mergeReportRows({ status: [r('s1', 'road', 1), r('bad', 'general', 2)], statusCount: 2, general: [r('g1', 'general', 3), r('x', 'road', 4)] });
  expect(out.rows.map((x) => x.id)).toEqual(['s1', 'g1']);
});

it('flags truncation at the row limit', () => {
  const status = Array.from({ length: STATUS_LIMIT }, (_, i) => r(`s${i}`, 'road', i));
  expect(mergeReportRows({ status, statusCount: STATUS_LIMIT, general: [] }).statusTruncated).toBe(true);
});

it('flags truncation when the server returned fewer rows than exist (API row cap)', () => {
  const status = Array.from({ length: 1000 }, (_, i) => r(`s${i}`, 'road', i));
  expect(mergeReportRows({ status, statusCount: 1500, general: [] }).statusTruncated).toBe(true);
});

it('fails closed when the count is unknown', () => {
  expect(mergeReportRows({ status: [r('s', 'road', 1)], statusCount: null, general: [] }).statusTruncated).toBe(true);
  expect(mergeReportRows({ status: [], statusCount: NaN, general: [] }).statusTruncated).toBe(true);
});
