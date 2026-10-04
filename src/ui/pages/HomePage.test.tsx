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
it('shows the truncation banner only when the status fetch was truncated', () => {
  snapshot = base({ statusTruncated: true });
  const { unmount } = open();
  expect(screen.getByText('ข้อมูลรายงานมีมากเกินไป สถานะอาจไม่ครบ — โปรดแจ้งกรรมการ')).toBeInTheDocument();
  unmount();
  snapshot = base({ statusTruncated: false });
  open();
  expect(screen.queryByText(/ข้อมูลรายงานมีมากเกินไป/)).not.toBeInTheDocument();
});
