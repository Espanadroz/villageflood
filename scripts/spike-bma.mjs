// scripts/spike-bma.mjs — run: node scripts/spike-bma.mjs
const BASE = 'https://weather.bangkok.go.th';
const targets = [
  { name: 'canal', method: 'GET', path: '/Klongmap/GetDataForUpdate' },
  { name: 'rain', method: 'POST', path: '/rain/PageMap/GetDataForUpdate' },
  { name: 'flood-road', method: 'POST', path: '/Flood/PageMap/GetDataTable' },
];
const dotnet = (s) => (s ? Number(/\/Date\((-?\d+)\)\//.exec(s)?.[1]) : NaN);

for (const t of targets) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + t.path, { method: t.method, body: t.method === 'POST' ? '' : undefined });
    const text = await res.text();
    console.log(`${t.name}: HTTP ${res.status}, ${text.length} bytes, ${Date.now() - started} ms`);
    if (t.name === 'canal' && res.ok) {
      const st = JSON.parse(text).waterStation.find((w) => w.water_station_info?.water_code === 'WL.STN.02');
      const last = st?.water_station_info?.water_level_last;
      const age = Math.round((Date.now() - dotnet(last?.site_timestamp)) / 60000);
      console.log(`  WL.STN.02 wl_in=${last?.wl_in} observed ${age} min ago`);
    }
  } catch (e) {
    console.log(`${t.name}: FAILED ${e.cause?.code ?? e.message}`);
  }
}
