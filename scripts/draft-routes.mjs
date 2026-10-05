// scripts/draft-routes.mjs — one-off. Run: node scripts/draft-routes.mjs [--lat 13.76548] [--lng 100.71419]
// Drafts destinations, road segments and routes out of the village from OSRM driving routes (OpenStreetMap data).
// Writes data/draft/{destinations,segments,routes}.json for the committee to REVIEW, then load with scripts/import-geo.mjs
// (destinations first, then segments, then routes).
//
// Safety: a route is only ever shown as passable when every one of its segments has a fresh resident/committee report,
// so a drafted route with no reports is "unknown" and is never recommended. The committee still has to confirm that the
// segments are split where they actually want to report (a segment is the unit residents report on).
import { mkdir, writeFile } from 'node:fs/promises';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); const v = i >= 0 ? Number(process.argv[i + 1]) : dflt; if (!Number.isFinite(v)) { console.error(`--${name} must be a number`); process.exit(1); } return v; };
const ORIGIN = { lat: arg('lat', 13.76548), lng: arg('lng', 100.71419) };
const MAX_SEGMENT_M = 2500; // flooding is local: long roads are cut so a report says WHERE
const MIN_SEGMENT_M = 300;
const MAX_ALTERNATIVES = 2;

const DESTINATIONS = [
  { id: 'dest-arl-lat-krabang', name: 'สถานีแอร์พอร์ตเรลลิงก์ลาดกระบัง', kind: 'station', lat: 13.72719, lng: 100.7468 },
  { id: 'dest-arl-hua-mak', name: 'สถานีแอร์พอร์ตเรลลิงก์หัวหมาก (เข้าเมือง)', kind: 'station', lat: 13.73610, lng: 100.64116 },
  { id: 'dest-ramkhamhaeng-univ', name: 'ม.รามคำแหง หัวหมาก (เข้าเมือง)', kind: 'landmark', lat: 13.75620, lng: 100.61745 },
  { id: 'dest-minburi-market', name: 'ตลาดมีนบุรี (ไปทางเหนือ)', kind: 'market', lat: 13.81251, lng: 100.72584 },
  { id: 'dest-suvarnabhumi', name: 'ท่าอากาศยานสุวรรณภูมิ', kind: 'airport', lat: 13.68188, lng: 100.74858 },
  { id: 'dest-sirindhorn-hospital', name: 'โรงพยาบาลสิรินธร', kind: 'hospital', lat: 13.71750, lng: 100.70684 },
];

const R = 6371000;
const rad = (x) => (x * Math.PI) / 180;
const hav = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const lineLen = (cs) => cs.slice(1).reduce((n, c, i) => n + hav({ lat: cs[i][1], lng: cs[i][0] }, { lat: c[1], lng: c[0] }), 0);
const key = (c) => `${c[1].toFixed(5)},${c[0].toFixed(5)}`;
const fail = (m) => { console.error(`draft-routes failed: ${m}`); process.exit(1); };

async function osrm(dest) {
  const url = `https://router.project-osrm.org/route/v1/driving/${ORIGIN.lng},${ORIGIN.lat};${dest.lng},${dest.lat}?alternatives=${MAX_ALTERNATIVES}&steps=true&geometries=geojson&overview=full`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'village-flood-portal/1.0 (community project)' }, signal: AbortSignal.timeout(45_000) });
      if (res.ok) { const j = await res.json(); if (j.code === 'Ok' && Array.isArray(j.routes)) return j.routes; }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  fail(`OSRM did not answer for ${dest.name}`);
}

/** Group consecutive steps by road name, merge tiny pieces, cut long ones. Returns [{road, coords}]. */
function chunk(route) {
  const raw = [];
  for (const leg of route.legs) for (const st of leg.steps) {
    const cs = st.geometry.coordinates;
    if (cs.length < 2) continue;
    const road = (st.name || '').trim() || 'ถนนไม่มีชื่อ';
    const last = raw[raw.length - 1];
    if (last && last.road === road) last.coords.push(...cs.slice(1));
    else raw.push({ road, coords: [...cs] });
  }
  const merged = [];
  for (const c of raw) {
    const prev = merged[merged.length - 1];
    if (prev && lineLen(c.coords) < MIN_SEGMENT_M) prev.coords.push(...c.coords.slice(1));
    else merged.push({ road: c.road, coords: [...c.coords] });
  }
  if (merged.length > 1 && lineLen(merged[0].coords) < MIN_SEGMENT_M) { const [a, b] = merged; merged.splice(0, 2, { road: b.road, coords: [...a.coords, ...b.coords.slice(1)] }); }
  const out = [];
  for (const c of merged) {
    const total = lineLen(c.coords);
    const parts = Math.max(1, Math.ceil(total / MAX_SEGMENT_M));
    if (parts === 1) { out.push(c); continue; }
    const target = total / parts;
    let cur = [c.coords[0]];
    let acc = 0;
    let cuts = 0;
    for (let i = 1; i < c.coords.length; i++) {
      cur.push(c.coords[i]);
      acc += hav({ lat: c.coords[i - 1][1], lng: c.coords[i - 1][0] }, { lat: c.coords[i][1], lng: c.coords[i][0] });
      if (acc >= target && cuts < parts - 1 && i < c.coords.length - 1) {
        out.push({ road: c.road, coords: cur }); cur = [c.coords[i]]; acc = 0; cuts++;
      }
    }
    if (cur.length > 1) out.push({ road: c.road, coords: cur });
  }
  return out;
}

const segments = new Map();
const routes = [];
for (const dest of DESTINATIONS) {
  const found = await osrm(dest);
  const seenSigs = new Set();
  let n = 0;
  for (const r of found) {
    const chunks = chunk(r);
    const ids = [];
    let fromStart = 0;
    for (const c of chunks) {
      const id = `seg-${key(c.coords[0])}-${key(c.coords[c.coords.length - 1])}`.replace(/\./g, '');
      const len = lineLen(c.coords);
      if (!segments.has(id)) segments.set(id, { id, name: `${c.road} (ห่างหมู่บ้าน ${(fromStart / 1000).toFixed(1)} กม.)`, geojson: { type: 'LineString', coordinates: c.coords.map(([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]) }, sort: segments.size });
      ids.push(id);
      fromStart += len;
    }
    const sig = ids.join('|');
    if (seenSigs.has(sig) || ids.length === 0) continue;
    seenSigs.add(sig);
    n++;
    const longest = [...chunks].sort((a, b) => lineLen(b.coords) - lineLen(a.coords)).map((c) => c.road).filter((x, i, a) => a.indexOf(x) === i && x !== 'ถนนไม่มีชื่อ').slice(0, 2);
    const mids = chunks.slice(1, -1).map((c) => c.coords[0]);
    const pick = mids.length <= 3 ? mids : [mids[Math.floor(mids.length / 4)], mids[Math.floor(mids.length / 2)], mids[Math.floor((mids.length * 3) / 4)]];
    routes.push({
      id: `route-${dest.id.replace('dest-', '')}-${n}`,
      name: `${dest.name.replace(/ \(.*\)$/, '')} ทางที่ ${n}${longest.length ? ` — ผ่าน ${longest.join(' / ')}` : ''}`,
      destination_id: dest.id, segment_ids: ids,
      waypoints: pick.map(([lng, lat]) => ({ lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) })),
      distance_m: Math.round(r.distance),
    });
  }
  await new Promise((r) => setTimeout(r, 1200)); // be polite to the public demo server
}

await mkdir('data/draft', { recursive: true });
await writeFile('data/draft/destinations.json', JSON.stringify(DESTINATIONS, null, 2));
await writeFile('data/draft/segments.json', JSON.stringify([...segments.values()], null, 2));
await writeFile('data/draft/routes.json', JSON.stringify(routes, null, 2));
console.log(`${DESTINATIONS.length} destinations, ${segments.size} segments, ${routes.length} routes -> data/draft/`);
for (const r of routes) console.log(`  ${r.id}: ${(r.distance_m / 1000).toFixed(1)} km, ${r.segment_ids.length} segments — ${r.name}`);
