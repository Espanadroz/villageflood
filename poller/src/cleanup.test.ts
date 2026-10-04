import { selectExpiredMedia } from './cleanup';

const NOW = new Date('2026-10-31T00:00:00Z');
const rows = [
  { id: 'a', media_path: 'd/a.jpg', created_at: '2026-09-30T00:00:00Z' },
  { id: 'b', media_path: 'd/b.jpg', created_at: '2026-10-10T00:00:00Z' },
  { id: 'c', media_path: null, created_at: '2026-08-01T00:00:00Z' },
];
it('selects only reports with media older than the retention period', () => {
  expect(selectExpiredMedia(rows, NOW, 30).map((r) => r.id)).toEqual(['a']);
});
