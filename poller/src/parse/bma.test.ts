import { parseBmaCanal, parseBmaRain, parseDotNetDate } from './bma';

describe('parseDotNetDate', () => {
  it('parses /Date(ms)/', () => expect(parseDotNetDate('/Date(1791108300000)/')?.getTime()).toBe(1791108300000));
  it('treats the .NET "year 1" sentinel and junk as null', () => {
    expect(parseDotNetDate('/Date(-62135596800000)/')).toBeNull();
    expect(parseDotNetDate(null)).toBeNull();
    expect(parseDotNetDate('nope')).toBeNull();
  });
});

const canal = {
  waterStation: [
    { water_station_info: { water_code: 'WL.STN.02', water_shortname: 'ค.สองต้นน่น ซ.ร่มเกล้า 20', latitude: 13.7771, longitude: 100.73883,
        water_level_last: { wl_in: 0.72, wl_out01: null, site_timestamp: '/Date(1791108300000)/' } } },
    { water_station_info: { water_code: 'WL.PWT.04', water_shortname: 'ปตร.ประเวศฯ-ลาดกระบัง', latitude: 13.72, longitude: 100.76,
        water_level_last: { wl_in: 0.9, wl_out01: 0.4, site_timestamp: '/Date(1791108300000)/' } } },
    { water_station_info: { water_code: 'WL.OTHER.01', water_shortname: 'อื่น', latitude: 1, longitude: 1,
        water_level_last: { wl_in: 1, wl_out01: null, site_timestamp: '/Date(1791108300000)/' } } },
    { water_station_info: { water_code: 'WL.STN.01', water_shortname: 'ไม่มีค่า', latitude: 1, longitude: 1,
        water_level_last: { wl_in: null, wl_out01: null, site_timestamp: '/Date(-62135596800000)/' } } },
    { water_id: '10' },
  ],
};

describe('parseBmaCanal', () => {
  const out = parseBmaCanal(canal);
  it('keeps only watched stations that have a value', () => {
    expect(new Set(out.map((r) => r.stationId))).toEqual(new Set(['WL.STN.02', 'WL.PWT.04']));
  });
  it('maps the primary gauge reading', () => {
    expect(out.find((r) => r.stationId === 'WL.STN.02' && r.metric === 'wl_in')).toMatchObject({
      source: 'bma_canal', value: 0.72, stationName: 'ค.สองต้นน่น ซ.ร่มเกล้า 20', lat: 13.7771, lng: 100.73883, observedAt: new Date(1791108300000),
    });
  });
  it('emits the outside-gate level for sluice stations', () => {
    expect(out.find((r) => r.stationId === 'WL.PWT.04' && r.metric === 'wl_out01')?.value).toBe(0.4);
  });
  it('tolerates malformed input', () => expect(parseBmaCanal({})).toEqual([]));
});

describe('parseBmaRain', () => {
  const rain = [
    { rain_code: 'RF.MBR.03', rain_shortname: 'ปตร.คลองบึงขวาง', latitude: 13.8, longitude: 100.7, site_timestamp: '/Date(1791099300000)/', rf1hr: 27, rf24hr: 27.5 },
    { rain_code: 'RF.KTY.01', rain_shortname: 'คลองเตย', latitude: 13.7, longitude: 100.5, site_timestamp: '/Date(1791099300000)/', rf1hr: 0, rf24hr: 0 },
  ];
  it('emits 1h and 24h rainfall for watched stations only', () => {
    const out = parseBmaRain(rain);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.metric).sort()).toEqual(['rf1hr', 'rf24hr']);
    expect(out.find((r) => r.metric === 'rf1hr')).toMatchObject({ source: 'bma_rain', stationId: 'RF.MBR.03', value: 27, unit: 'mm' });
  });
  it('tolerates a non-array', () => expect(parseBmaRain({})).toEqual([]));
});

describe('BMA -99 sentinel', () => {
  it('never emits -99 as a reading', () => {
    const out = parseBmaCanal({ waterStation: [{ water_station_info: { water_code: 'WL.STN.02', water_shortname: 'x', latitude: 1, longitude: 1,
      water_level_last: { wl_in: 0.5, wl_out01: -99, site_timestamp: '/Date(1791108300000)/' } } }] });
    expect(out.map((r) => r.metric)).toEqual(['wl_in']);
  });
});

describe('BMA no-data guards', () => {
  const st = (last: Record<string, unknown>, lat: unknown = 1) => ({ waterStation: [{ water_station_info: { water_code: 'WL.STN.02', water_shortname: 'x', latitude: lat, longitude: 1,
    water_level_last: { wl_in: null, wl_out01: null, site_timestamp: '/Date(1791108300000)/', ...last } } }] });
  it('skips wl_in = -99', () => expect(parseBmaCanal(st({ wl_in: -99 }))).toEqual([]));
  it('accepts a real negative level (-3)', () => expect(parseBmaCanal(st({ wl_in: -3 })).map((r) => r.value)).toEqual([-3]));
  it('nulls a -99 latitude without dropping the row', () => {
    const out = parseBmaCanal(st({ wl_in: 0.5 }, -99));
    expect(out).toHaveLength(1);
    expect(out[0]!.lat).toBeNull();
  });
  it('skips negative rainfall', () => {
    const out = parseBmaRain([{ rain_code: 'RF.MBR.03', rain_shortname: 'x', latitude: 1, longitude: 1, site_timestamp: '/Date(1791099300000)/', rf1hr: -99, rf24hr: -1 }]);
    expect(out).toEqual([]);
  });
  it('keeps zero rainfall', () => {
    const out = parseBmaRain([{ rain_code: 'RF.MBR.03', rain_shortname: 'x', latitude: 1, longitude: 1, site_timestamp: '/Date(1791099300000)/', rf1hr: 0, rf24hr: -1 }]);
    expect(out.map((r) => r.metric)).toEqual(['rf1hr']);
  });
});

describe('future timestamps (> 10 min ahead) are rejected', () => {
  const T = 1791108300000;
  const now = (offsetMin: number) => new Date(T - offsetMin * 60_000);
  const st = { waterStation: [{ water_station_info: { water_code: 'WL.STN.02', water_shortname: 'x', latitude: 1, longitude: 1,
    water_level_last: { wl_in: 0.5, wl_out01: null, site_timestamp: `/Date(${T})/` } } }] };
  const rain = [{ rain_code: 'RF.MBR.03', rain_shortname: 'x', latitude: 1, longitude: 1, site_timestamp: `/Date(${T})/`, rf1hr: 1, rf24hr: 2 }];
  it('canal: 10 min ahead kept, 11 min ahead dropped', () => {
    expect(parseBmaCanal(st, now(10))).toHaveLength(1);
    expect(parseBmaCanal(st, now(11))).toEqual([]);
  });
  it('rain: 11 min ahead dropped', () => {
    expect(parseBmaRain(rain, now(0))).toHaveLength(2);
    expect(parseBmaRain(rain, now(11))).toEqual([]);
  });
});
