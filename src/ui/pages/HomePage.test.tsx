import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { Snapshot } from '../../data/types';
import { HomePage } from './HomePage';

const NOW = 1_800_000_000_000;
const levels = [{ level: 1, label: 'ขีดที่ 1' }, { level: 2, label: 'ขีดที่ 2' }];
const rep = (id: string, value: string, minutesAgo: number) => ({
  id, kind: 'water_level', targetId: 'wall', value, createdAt: NOW - minutesAgo * 60_000,
  hasEvidence: true, locationOk: true, byCommittee: false, confirmedByCommittee: false,
});
let snapshot: Snapshot;
const base = (o: Partial<Snapshot> = {}) => ({
  segments: [], places: [], destinations: [], routes: [], feed: [], latest: [], recent: [], warnings: [], incidents: [],
  marks: [{ id: 'wall', name: 'กำแพงริมคลอง', geojson: { type: 'Point', coordinates: [0, 0] }, levels }],
  reports: [],
  settings: { ttlMs: { road: 3 * 3_600_000, water_level: 2 * 3_600_000, supply: 12 * 3_600_000 }, agencyMaxAgeMs: 3_600_000, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
  serverOffsetMs: 0, fetchedAt: NOW, statusTruncated: false, ...o,
}) as unknown as Snapshot;
vi.mock('../../state/SnapshotContext', () => ({ useData: () => ({ snapshot, now: NOW, reload: vi.fn() }) }));
const open = () => render(<MemoryRouter><HomePage /></MemoryRouter>);
const markLine = () => screen.getByText('กำแพงริมคลอง', { selector: 'b' }).closest('li')!;

it('shows the resolved water-mark level with its age', () => {
  snapshot = base({ reports: [rep('a', '2', 15)] as never });
  open();
  expect(markLine()).toHaveTextContent('ขีดที่ 2');
  expect(markLine()).toHaveTextContent('15 นาทีที่แล้ว');
});
it('shows ไม่ทราบ once the mark report has expired', () => {
  snapshot = base({ reports: [rep('a', '2', 121)] as never });
  open();
  expect(markLine()).toHaveTextContent('ไม่ทราบ');
  expect(markLine()).not.toHaveTextContent('ขีดที่ 2');
});
it('shows the conflict note and the higher level', () => {
  snapshot = base({ reports: [rep('a', '1', 5), rep('b', '2', 10)] as never });
  open();
  expect(markLine()).toHaveTextContent('ขีดที่ 2');
  expect(markLine()).toHaveTextContent('มีรายงานขัดแย้ง');
});
it('shows the committee wall note even when it is older than the 200 newest feed items', async () => {
  const { mergeReportRows } = await import('../../data/reportRows');
  const { mapReportRow } = await import('../../data/mappers');
  const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
  const row = (id: string, kind: string, minAgo: number, o: object = {}) => ({ id, kind, target_id: 'village', value: kind === 'general' ? 'note' : 'impassable', nickname: 'n', created_at: iso(minAgo),
    location_ok: true, media_path: null, media_type: null, note: 'x', by_committee: false, confirmed_by_committee: false, confirmations: 0, ...o });
  const wall = row('wall', 'general', 300, { target_id: 'wall', by_committee: true, note: 'กำแพงยังแข็งแรง' });
  const spam = Array.from({ length: 200 }, (_, i) => row(`g${i}`, 'general', i * 0.1));
  const merged = mergeReportRows({ status: [], statusCount: 0, general: spam, committee: [wall] });
  snapshot = base({ feed: merged.feedRows.map((r) => mapReportRow(r, (p) => p).feed) as never });
  open();
  expect(screen.getByText(/กำแพงยังแข็งแรง/)).toBeInTheDocument();
});
