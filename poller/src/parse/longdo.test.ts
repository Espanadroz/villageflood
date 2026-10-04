import { parseLongdo } from './longdo';

const NOW = new Date('2026-10-04T10:00:00Z'); // 17:00 Thai
const feed = [
  { eid: '1', title: 'น้ำท่วม ถนนลาดกระบัง', latitude: '13.7218', longitude: '100.7764', type: '6', start: '2026-10-04 15:00:00', stop: '2026-10-04 19:00:00', severity: 2 },
  { eid: '2', title: 'ฝนตก', latitude: '13.7263', longitude: '100.5098', type: '5', start: '2026-10-04 16:00:00', stop: '2026-10-04 18:00:00', severity: 1 },
  { eid: '3', title: 'น้ำท่วมไกลมาก', latitude: '14.5', longitude: '100.5', type: '6', start: '2026-10-04 16:00:00', stop: '2026-10-04 18:00:00', severity: 3 },
  { eid: '4', title: 'น้ำท่วมหมดอายุ', latitude: '13.7218', longitude: '100.7764', type: '6', start: '2026-10-04 08:00:00', stop: '2026-10-04 10:00:00', severity: 1 },
];
it('keeps current flood incidents near the village only', () => {
  const out = parseLongdo(feed, NOW);
  expect(out.map((i) => i.id)).toEqual(['1']);
  expect(out[0]).toMatchObject({ lat: 13.7218, lng: 100.7764, severity: 2 });
  expect(out[0]!.stopAt.toISOString()).toBe('2026-10-04T12:00:00.000Z');
});
it('tolerates non-array input', () => expect(parseLongdo({}, NOW)).toEqual([]));

it('skips rows with bad coordinates or timestamps and never emits NaN severity', () => {
  const rows = [
    { eid: '5', title: 'x', latitude: null, longitude: '100.7764', type: '6', start: '2026-10-04 15:00:00', stop: '2026-10-04 19:00:00', severity: 1 },
    { eid: '6', title: 'x', latitude: '13.7218', longitude: '100.7764', type: '6', start: 'bad', stop: '2026-10-04 19:00:00', severity: 1 },
    { eid: '7', title: 'x', latitude: '13.7218', longitude: '100.7764', type: '6', start: '2026-10-04 15:00:00', stop: '2026-10-04 19:00:00', severity: 'high' },
  ];
  const out = parseLongdo(rows, NOW);
  expect(out.map((i) => i.id)).toEqual(['7']);
  expect(out[0]!.severity).toBe(0);
});

it('skips incidents that start after they stop', () => {
  const rows = [{ eid: '8', title: 'x', latitude: '13.7218', longitude: '100.7764', type: '6', start: '2026-10-04 19:00:00', stop: '2026-10-04 18:30:00', severity: 1 }];
  expect(parseLongdo(rows, NOW)).toEqual([]);
});
