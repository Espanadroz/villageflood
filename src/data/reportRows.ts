import type { ReportRow } from './mappers';

/** Status rows (road/water_level/supply, last 7 days). 7 days covers the maximum committee TTL of 168 h. */
export const STATUS_LIMIT = 5000;
/** General notes and the displayed feed are capped at the newest 200. */
export const FEED_LIMIT = 200;
const STATUS_KINDS = new Set(['road', 'water_level', 'supply']);

const newestFirst = (a: ReportRow, b: ReportRow) => Date.parse(b.created_at) - Date.parse(a.created_at);

/**
 * Status rows and general notes are fetched separately so notes can never push a status row out of the window.
 * `statusCount` is the server's exact count: if it is unknown, or more rows exist than were returned
 * (row limit or API max_rows cap), the snapshot is flagged as truncated (fail closed: a banner warns).
 */
export const COMMITTEE_NOTES_LIMIT = 50;

export function mergeReportRows(input: { status: ReportRow[]; statusCount: number | null; general: ReportRow[]; committee?: ReportRow[] }) {
  const status = input.status.filter((r) => STATUS_KINDS.has(r.kind));
  const general = input.general.filter((r) => r.kind === 'general');
  const count = input.statusCount;
  const statusTruncated = typeof count !== 'number' || !Number.isFinite(count)
    || count > input.status.length || input.status.length >= STATUS_LIMIT;
  // committee wall/drainage notes are fetched separately and always kept, so newer reports or note spam
  // can never hide the committee's current note from Home
  const committee = (input.committee ?? []).filter((r) => r.kind === 'general' && r.by_committee);
  const seen = new Set<string>();
  const rows = [...status, ...general, ...committee].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).sort(newestFirst);
  const head = rows.slice(0, FEED_LIMIT);
  const inHead = new Set(head.map((r) => r.id));
  const extra = rows.slice(FEED_LIMIT).filter((r) => r.kind === 'general' && r.by_committee && !inHead.has(r.id));
  const feedRows = [...head, ...extra]; // extra rows are older than head, so newest-first order is kept
  return { rows, feedRows, statusTruncated };
}
