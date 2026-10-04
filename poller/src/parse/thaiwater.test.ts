import { parseThaiWater } from './thaiwater';

const tw = { waterlevel_data: { data: [
  { waterlevel_datetime: '2026-10-04 14:20', waterlevel_msl: '0.64',
    station: { id: 3, tele_station_name: { th: 'คลองลำปลาทิว ลาดกระบัง' }, tele_station_lat: 13.7407, tele_station_long: 100.79468 } },
  { waterlevel_datetime: '2026-10-04 13:00', waterlevel_msl: '5.49',
    station: { id: 1095849, tele_station_name: { th: 'สะพานหัวเวียง' }, tele_station_lat: 14.36, tele_station_long: 100.41 } },
  { waterlevel_datetime: '2026-10-04 14:20', waterlevel_msl: null,
    station: { id: 4, tele_station_name: { th: 'คลองลำปลาทิว ลาดกระบัง' }, tele_station_lat: 13.7, tele_station_long: 100.7 } },
] } };

it('keeps watched stations with a value and converts Thai local time to UTC', () => {
  const out = parseThaiWater(tw);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ source: 'thaiwater', stationId: '3', metric: 'waterlevel_msl', value: 0.64, unit: 'm MSL' });
  expect(out[0]!.observedAt.toISOString()).toBe('2026-10-04T07:20:00.000Z');
});
it('tolerates malformed input', () => expect(parseThaiWater(null)).toEqual([]));

it('skips rows with an invalid timestamp and nulls non-numeric coordinates', () => {
  const bad = { waterlevel_data: { data: [
    { waterlevel_datetime: 'garbage', waterlevel_msl: '1.0', station: { id: 5, tele_station_name: { th: 'คลองลำปลาทิว' }, tele_station_lat: 1, tele_station_long: 1 } },
    { waterlevel_datetime: '2026-10-04 14:20', waterlevel_msl: '1.0', station: { id: 6, tele_station_name: { th: 'คลองลำปลาทิว' }, tele_station_lat: null, tele_station_long: 'x' } },
  ] } };
  const out = parseThaiWater(bad);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ stationId: '6', lat: null, lng: null });
});
