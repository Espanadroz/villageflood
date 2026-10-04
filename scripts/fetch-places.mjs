// scripts/fetch-places.mjs — one-off. Run: node scripts/fetch-places.mjs
// Writes data/places.candidates.json for the committee to review and prune by hand.
// (OSM Overpass is fine for one-off curation; never use it as a live backend. Google Places data may not be cached, so it is not used.)
import { mkdir, writeFile } from 'node:fs/promises';

const CENTER = { lat: 13.7771, lng: 100.73883 }; // replace with the village gate once known
const RADIUS_M = 6000;
const query = `[out:json][timeout:60];
(
  nwr(around:${RADIUS_M},${CENTER.lat},${CENTER.lng})["shop"~"^(convenience|supermarket)$"];
  nwr(around:${RADIUS_M},${CENTER.lat},${CENTER.lng})["amenity"~"^(marketplace|restaurant|fuel|hospital|clinic)$"];
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

let res;
try {
  res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    headers: { 'user-agent': 'village-flood-portal/1.0' },
    signal: AbortSignal.timeout(90_000),
  });
} catch (e) {
  fail(`network error calling Overpass (${e instanceof Error ? e.message : e})`);
}
if (!res.ok) fail(`Overpass HTTP ${res.status}`);

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
  .map(({ e, lat, lng }) => ({ id: `osm-${e.type}-${e.id}`, name: e.tags.name, category: category(e.tags), geojson: { type: 'Point', coordinates: [lng, lat] } }));

if (places.length === 0) fail('Overpass returned no named candidates — nothing written');

await mkdir('data', { recursive: true });
await writeFile('data/places.candidates.json', JSON.stringify(places, null, 2));
console.log(`${places.length} candidates written to data/places.candidates.json — review with the committee, delete what you don't want, then load with scripts/import-geo.mjs`);
