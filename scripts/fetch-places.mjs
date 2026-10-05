// scripts/fetch-places.mjs — one-off. Run: node scripts/fetch-places.mjs
// Writes data/places.candidates.json for the committee to review and prune by hand.
// (OSM Overpass is fine for one-off curation; never use it as a live backend. Google Places data may not be cached, so it is not used.)
import { access, mkdir, writeFile } from 'node:fs/promises';

// Usage: node scripts/fetch-places.mjs [--lat 13.76548] [--lng 100.71419] [--radius 10000] [--force]
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); const v = i >= 0 ? Number(process.argv[i + 1]) : dflt; if (!Number.isFinite(v)) { console.error(`--${name} must be a number`); process.exit(1); } return v; };
const CENTER = { lat: arg('lat', 13.76548), lng: arg('lng', 100.71419) }; // Perfect Place Wongwaen-Ramkhamhaeng (geocoded from OSM); confirm the exact gate with the committee
const RADIUS_M = arg('radius', 10000);
const STORE_RADIUS_M = arg('store-radius', 4000); // convenience stores are everywhere: keep only the walkable ones
// Clinics a resident would not go to for a flood emergency (vets, beauty, dental, Chinese medicine).
const NOT_FOR_RESIDENTS = /animal|veterin|สัตว์|aesthetic|ความงาม|เสริมสวย|ทันต|dental|แพทย์แผนจีน|ศัลย|skin|laser/i;
const haversineM = (a, b) => { const R = 6371000, r = (x) => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const query = `[out:json][timeout:60];
(
  nwr(around:${RADIUS_M},${CENTER.lat},${CENTER.lng})["shop"~"^(convenience|supermarket)$"];
  nwr(around:${RADIUS_M},${CENTER.lat},${CENTER.lng})["amenity"~"^(marketplace|fuel|hospital)$"];
  nwr(around:${RADIUS_M},${CENTER.lat},${CENTER.lng})["amenity"="clinic"]["name"];
  nwr(around:3000,${CENTER.lat},${CENTER.lng})["amenity"="restaurant"]["name"];
);
out center tags;`;

const category = (t) =>
  t.shop === 'convenience' || t.shop === 'supermarket' ? 'store'
  : t.amenity === 'marketplace' ? 'market'
  : t.amenity === 'restaurant' ? 'food'
  : t.amenity === 'fuel' ? 'fuel'
  : 'hospital';

function fail(msg) {
  console.error(`fetch-places failed: ${msg}`);
  process.exit(1);
}

// The public Overpass servers are often overloaded (504): try each mirror before giving up.
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
let res;
const errors = [];
for (const url of ENDPOINTS) {
  try {
    const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'user-agent': 'village-flood-portal/1.0' }, signal: AbortSignal.timeout(90_000) });
    if (r.ok) { res = r; break; }
    errors.push(`${new URL(url).host} HTTP ${r.status}`);
  } catch (e) {
    errors.push(`${new URL(url).host} ${e instanceof Error ? e.message : e}`);
  }
}
if (!res) fail(`every Overpass mirror failed (${errors.join('; ')}) — retry later`);

let body;
try {
  body = await res.json();
} catch {
  fail('Overpass returned a non-JSON response (likely overloaded) — retry later');
}
if (!body || !Array.isArray(body.elements)) fail('Overpass response has no "elements" array');

const places = body.elements
  .map((e) => ({ e, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }))
  .filter(({ e, lat, lng }) => e.tags?.name && Number.isFinite(lat) && Number.isFinite(lng))
  .sort((x, y) => haversineM(CENTER, { lat: x.lat, lng: x.lng }) - haversineM(CENTER, { lat: y.lat, lng: y.lng }))
  .filter(({ e }) => !NOT_FOR_RESIDENTS.test(`${e.tags.name} ${e.tags.healthcare ?? ''} ${e.tags['healthcare:speciality'] ?? ''}`))
  .map(({ e, lat, lng }) => ({ e, dist: haversineM(CENTER, { lat, lng }), id: `osm-${e.type}-${e.id}`, name: e.tags.name, category: category(e.tags), geojson: { type: 'Point', coordinates: [lng, lat] } }))
  .filter((p) => p.category !== 'store' || p.dist <= STORE_RADIUS_M);

// Many chains share one name (135 × "7-Eleven"): residents must be able to tell them apart in a dropdown.
const nameCount = places.reduce((m, p) => m.set(p.name, (m.get(p.name) ?? 0) + 1), new Map());
for (const p of places) {
  if (nameCount.get(p.name) < 2) continue;
  const where = p.e.tags.branch ?? p.e.tags['addr:street'] ?? p.e.tags['addr:subdistrict'] ?? p.e.tags['addr:suburb'];
  p.name = `${p.name} (${where ? `${where}, ` : ''}${(p.dist / 1000).toFixed(1)} กม.)`;
}
// Same chain, same street, same rounded distance: number them so every dropdown entry is unique.
const seenName = new Map();
for (const p of places) {
  const n = (seenName.get(p.name) ?? 0) + 1;
  seenName.set(p.name, n);
  if (n > 1) p.name = `${p.name} #${n}`;
}
for (const p of places) { delete p.e; delete p.dist; }

if (places.length === 0) fail('Overpass returned no named candidates — nothing written');

if (typeof body.remark === 'string' && body.remark.trim()) {
  console.warn(`WARNING: Overpass remark: "${body.remark.trim()}" — results may be truncated.`);
}

const MAIN = 'data/places.candidates.json';
const exists = await access(MAIN).then(() => true, () => false);
const force = process.argv.includes('--force');
let out = MAIN;
let why = '';
if (exists && !force) {
  out = `data/places.candidates.${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  why = ` (${MAIN} already exists and may be hand-pruned; pass --force to overwrite it)`;
}
await mkdir('data', { recursive: true });
await writeFile(out, JSON.stringify(places, null, 2));
const byCat = places.reduce((m, p) => ({ ...m, [p.category]: (m[p.category] ?? 0) + 1 }), {});
console.log('by category:', JSON.stringify(byCat));
console.log(`${places.length} candidates written to ${out}${why} — review with the committee, delete what you don't want, then load with scripts/import-geo.mjs`);
