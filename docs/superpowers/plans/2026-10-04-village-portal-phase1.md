# Village Flood Portal — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Thai, mobile-first community web portal where villagers see road/route/supply status and agency flood data with visible age, and report with photo/video evidence.

**Architecture:** Vite + React + TypeScript PWA (Vercel) reading from Supabase (Postgres+PostGIS, Storage, Auth for committee). All safety rules (expiry → unknown, conflict → worse, evidence required, stale never "passable") live in a pure, unit-tested TypeScript `src/core` module; the database RPC `submit_report` independently enforces evidence/location/rate-limit rules. A Node poller (`poller/`) fetches BMA, ThaiWater, TMD CAP and Longdo every 10 minutes into Supabase.

**Tech Stack:** TypeScript, React 18, Vite, Vitest + Testing Library, MapLibre GL JS + OpenFreeMap, Supabase (supabase-js, CLI, PostGIS), idb-keyval, fast-xml-parser, tsx, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-10-04-village-portal-phase1-design.md`

## Global Constraints

Copied from the spec; every task includes these.

- UI language is Thai; mobile-first PWA; hosted on Vercel; backend Supabase; map = MapLibre + OpenFreeMap (no Google Places, no Google map tiles).
- Road statuses are exactly five: แห้ง (`dry`) / รถเล็กไปได้ (`small_car`) / รถยกสูงเท่านั้น (`high_clearance`) / ผ่านไม่ได้ (`impassable`) / ไม่ทราบ (`unknown`).
- Evidence (photo or video) is **required** for: water-level reports; road reports `dry` / `small_car` / `high_clearance`. Not required for: road `impassable`, supply, general.
- Evidence must be freshly captured in-app (no gallery picks). Server records time + coordinates; if distance to the target exceeds the limit the report is flagged `location_ok=false` and has **no effect on status** until a committee member confirms it.
- Default TTLs (committee-adjustable): road 3 h → `unknown`; water level 2 h; supply 12 h. Nothing stays green after expiry.
- Conflicting valid reports → show the **worse** status with a "มีรายงานขัดแย้ง" note; committee override resolves it.
- Route state = worst segment, computed separately for `small_car` and `high_clearance`; any `unknown` segment (with no blocked segment) → route `unknown`; never shown as passable.
- Every datum shows its age ("อัปเดต 20 นาทีที่แล้ว"); agency data older than the limit shows "ข้อมูลเก่า" and is never used as current status.
- Gauge colour thresholds are NOT shown until the committee sets them; until then show raw value + trend only. Primary gauge: `WL.STN.02` (คลองสองต้นนุ่น ซ.ร่มเกล้า 20).
- Permanent disclaimer on every page: `ข้อมูลชุมชน ไม่ใช่ประกาศเตือนภัยทางการ`.
- Media auto-deleted after 30 days; video ≤ ~15 s; photos resized client-side; Thai privacy notice; controller = village committee.
- Poller runs every 10 minutes. Longdo event data is CC-BY 4.0 → show credit "ข้อมูลเหตุการณ์: iTIC / Longdo Traffic (CC-BY 4.0)".
- Google Maps hand-off: at most 3 waypoints on mobile; the route is always also drawn in-app; Apple Maps = destination only.
- Report rate limit: 10 reports / 10 minutes / device. Reads are public; writes only through RPC; committee actions need Supabase Auth + `committee_members`.

## File Structure

```
village-flood-app/
├─ package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html, .env.example
├─ scripts/
│  ├─ spike-bma.mjs              # Task 1: can this host reach BMA?
│  ├─ fetch-places.mjs           # Task 13: Overpass candidates for supply points
│  └─ import-geo.mjs             # Task 14: load segments/routes/marks/places from GeoJSON
├─ spike/camera.html             # Task 1: camera/geolocation device test page
├─ docs/spikes/                  # Task 1 results
├─ supabase/
│  ├─ config.toml (generated), seed.sql
│  └─ migrations/0001_schema.sql, 0002_rpc.sql
├─ poller/src/
│  ├─ types.ts, config.ts
│  ├─ parse/{bma,thaiwater,tmd,longdo}.ts (+ .test.ts)
│  ├─ fetch.ts, store.ts, cleanup.ts (+ .test.ts), run.ts
├─ src/
│  ├─ core/            # PURE logic, no I/O — heart of the safety rules
│  │  ├─ types.ts, config.ts, labels.ts, format.ts, geo.ts
│  │  ├─ evidence.ts, status.ts, routes.ts, agency.ts, validate.ts (+ .test.ts each)
│  ├─ data/{supabase,device,queries,submit,outbox,kv}.ts (+ tests for outbox/submit)
│  ├─ lib/media.ts (+ test)
│  ├─ state/useSnapshot.ts, state/useNow.ts
│  ├─ ui/{App,Layout,styles.css}, ui/components/*, ui/pages/*
│  └─ main.tsx
└─ tests/db/submit_report.int.test.ts
```

Tasks 1 (spikes) is a **gate for deployment choices** (Tasks 7-deploy, 10, 15) but not for Tasks 2–6, which can proceed in parallel.

---

### Task 1: Risk spikes (BMA reachability, camera/GPS on real phones, quotas)

**Files:**
- Create: `scripts/spike-bma.mjs`
- Create: `spike/camera.html`
- Create: `docs/spikes/2026-10-spike-results.md`

**Interfaces:**
- Produces: decisions recorded in `docs/spikes/2026-10-spike-results.md` under three headings that later tasks read: `POLLER_HOST` (`vercel` | `thai-vps` | `home-machine`), `CAPTURE_MODE` (`input-capture` | `in-page`), `QUOTA_OK` (`yes` | `no + notes`).

- [ ] **Step 1: Write the BMA reachability script**

```js
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
```

- [ ] **Step 2: Run it from this Mac (Thai IP)**

Run: `node scripts/spike-bma.mjs`
Expected: three lines `HTTP 200` and `WL.STN.02 wl_in=<number> observed <N> min ago`. (A prior check from this Mac succeeded; record it.)

- [ ] **Step 3: Run it from the candidate cloud host**

Create a throwaway Vercel function that runs the same fetches and returns the log lines, deploy it, open its URL, and record whether the three calls return 200 or 403. Make the function pin to a Singapore region (`"regions": ["sin1"]` in `vercel.json`) because that is the realistic target. Delete the throwaway project afterwards.

```js
// api/spike-bma.js (throwaway — delete after the test)
export default async function handler(req, res) {
  const out = [];
  for (const [m, p] of [['GET', '/Klongmap/GetDataForUpdate'], ['POST', '/rain/PageMap/GetDataForUpdate']]) {
    try {
      const r = await fetch('https://weather.bangkok.go.th' + p, { method: m, body: m === 'POST' ? '' : undefined });
      out.push(`${p}: HTTP ${r.status}`);
    } catch (e) { out.push(`${p}: FAILED ${e.cause?.code ?? e.message}`); }
  }
  res.status(200).send(out.join('\n'));
}
```

Decision rule → write `POLLER_HOST` in the results doc: both 200 → `vercel` (Vercel cron or GitHub Actions allowed); any 403/timeout → `thai-vps` or `home-machine` (a machine with a Thai IP running cron).

- [ ] **Step 4: Write the camera/GPS test page**

```html
<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Camera test</title></head>
<body style="font:16px system-ui;padding:16px">
<h3>1. input capture (photo)</h3>
<input id="p" type="file" accept="image/*" capture="environment">
<h3>2. input capture (video)</h3>
<input id="v" type="file" accept="video/*" capture="environment">
<h3>3. getUserMedia camera</h3>
<button id="gum">open camera</button> <video id="vid" playsinline muted style="width:100%"></video>
<h3>4. geolocation</h3>
<button id="geo">get position</button>
<pre id="log"></pre>
<script>
const log = (m) => (document.getElementById('log').textContent += m + '\n');
const info = (f) => log(`${f.name} type=${f.type} size=${f.size} lastModifiedAgeSec=${Math.round((Date.now() - f.lastModified) / 1000)}`);
p.onchange = () => info(p.files[0]);
v.onchange = () => info(v.files[0]);
gum.onclick = async () => {
  try { vid.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); await vid.play(); log('getUserMedia OK; MediaRecorder=' + (typeof MediaRecorder)); }
  catch (e) { log('getUserMedia FAIL ' + e.name); }
};
geo.onclick = () => navigator.geolocation.getCurrentPosition(
  (x) => log(`geo OK ${x.coords.latitude},${x.coords.longitude} ±${x.coords.accuracy}m`),
  (e) => log('geo FAIL ' + e.code + ' ' + e.message), { enableHighAccuracy: true, timeout: 15000 });
</script></body></html>
```

- [ ] **Step 5: Deploy the page and test on real phones**

Deploy `spike/` as a static Vercel project (`npx vercel spike --prod`). Post the link in a **test LINE chat** (not the village group), open it from LINE on **one iPhone and one Android**, and also in the phone's normal browser. For each device record: (a) does tapping the photo input open the camera directly, with no gallery option? (b) is `lastModifiedAgeSec` < 60 for a fresh photo and large for a gallery photo? (c) does the video input record, and what size is a 15 s clip? (d) does getUserMedia work in LINE's browser? (e) does geolocation prompt and return a fix?

Decision rule → write `CAPTURE_MODE`: if (a) is "camera only" or (b) separates fresh vs gallery on both devices → `input-capture`; otherwise → `in-page` (Task 10 then also builds `InPageCamera`).

- [ ] **Step 6: Check free-tier terms and quotas**

Read and note in the results doc (with date): Supabase pricing/limits page (database size, Storage size, egress, project pausing after inactivity), Vercel Hobby plan terms (non-commercial use; function/bandwidth limits). Estimate: 300 households × ~5 opens/day × 10 report thumbnails ≈ egress; photos ≈ 300 KB, so 30 days × 50 reports/day ≈ 450 MB. Write `QUOTA_OK: yes` or `no + what to change` (for example a Supabase Pro plan, or lower media retention).

- [ ] **Step 7: Write the results doc and commit**

`docs/spikes/2026-10-spike-results.md` must contain the three decisions plus the raw observations.

```bash
git add scripts/spike-bma.mjs spike docs/spikes
git commit -m "docs: record phase 1 risk spike results"
```

---

### Task 2: Project scaffold and shared constants

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `.env.example`, `tests/setup.ts`
- Create: `src/main.tsx`, `src/core/config.ts`
- Test: `src/core/config.test.ts`

**Interfaces:**
- Produces: `src/core/config.ts` exports `HOUR`, `TTL_MS` (`{ road, water_level, supply }`), `AGENCY_MAX_AGE_MS`, `WARNING_MAX_AGE_MS`, `MEDIA_RETENTION_DAYS`, `MAX_VIDEO_SECONDS`, `MAX_VIDEO_BYTES`, `FRESH_CAPTURE_MAX_AGE_MS`, `GOOGLE_MAPS_MAX_WAYPOINTS`, `DISCLAIMER_TH`, `LONGDO_CREDIT_TH`, `VILLAGE_CENTER` (`{ lat, lng }`), `PRIMARY_GAUGE` (`'WL.STN.02'`).

- [ ] **Step 1: Install dependencies**

```bash
cd ~/Desktop/village-flood-app
npm init -y
npm pkg set type=module name=village-flood-app private=true
npm install react react-dom react-router-dom maplibre-gl @supabase/supabase-js idb-keyval fast-xml-parser
npm install -D typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom @types/node vite-plugin-pwa tsx
npm pkg set scripts.dev="vite" scripts.build="tsc --noEmit && vite build" scripts.test="vitest run" scripts.poll="tsx --env-file=.env poller/src/run.ts"
printf 'node_modules\ndist\n.env\n.vercel\n.DS_Store\n' > .gitignore
```

- [ ] **Step 2: Write config files**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx", "strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom", "node"], "noEmit": true, "resolveJsonModule": true
  },
  "include": ["src", "poller/src", "tests", "scripts/**/*.d.ts", "vite.config.ts", "vitest.config.ts"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', globals: true, setupFiles: ['./tests/setup.ts'], include: ['src/**/*.test.{ts,tsx}', 'poller/src/**/*.test.ts', 'tests/**/*.test.ts'], exclude: ['tests/db/**', 'node_modules/**'] },
});
```

```ts
// tests/setup.ts
import '@testing-library/jest-dom/vitest';
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()] });
```

```html
<!-- index.html -->
<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b5cab" />
    <title>พอร์ทัลน้ำท่วมหมู่บ้าน</title>
  </head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

```
# .env.example
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# poller + tests only (never ship to the browser):
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
```

```tsx
// src/main.tsx (replaced in Task 8)
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')!).render(<p>กำลังเริ่มระบบ…</p>);
```

- [ ] **Step 3: Write the failing test for the spec constants**

```ts
// src/core/config.test.ts
import { TTL_MS, HOUR, MEDIA_RETENTION_DAYS, GOOGLE_MAPS_MAX_WAYPOINTS, DISCLAIMER_TH, PRIMARY_GAUGE } from './config';

describe('spec constants', () => {
  it('uses the agreed default TTLs', () => {
    expect(TTL_MS.road).toBe(3 * HOUR);
    expect(TTL_MS.water_level).toBe(2 * HOUR);
    expect(TTL_MS.supply).toBe(12 * HOUR);
  });
  it('matches other spec constants', () => {
    expect(MEDIA_RETENTION_DAYS).toBe(30);
    expect(GOOGLE_MAPS_MAX_WAYPOINTS).toBe(3);
    expect(DISCLAIMER_TH).toBe('ข้อมูลชุมชน ไม่ใช่ประกาศเตือนภัยทางการ');
    expect(PRIMARY_GAUGE).toBe('WL.STN.02');
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/core/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 5: Implement config**

```ts
// src/core/config.ts
export const HOUR = 3_600_000;
export const MINUTE = 60_000;

/** Default expiry per report kind. Committee can override via the `settings` table. */
export const TTL_MS = { road: 3 * HOUR, water_level: 2 * HOUR, supply: 12 * HOUR } as const;

/** Agency telemetry older than this is shown as "ข้อมูลเก่า" and never used as current. */
export const AGENCY_MAX_AGE_MS = 60 * MINUTE;
/** TMD warnings older than this are hidden. */
export const WARNING_MAX_AGE_MS = 48 * HOUR;

export const MEDIA_RETENTION_DAYS = 30;
export const MAX_VIDEO_SECONDS = 15;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // must match the storage bucket limit
export const FRESH_CAPTURE_MAX_AGE_MS = 5 * MINUTE; // file.lastModified must be this recent

export const GOOGLE_MAPS_MAX_WAYPOINTS = 3;

export const DISCLAIMER_TH = 'ข้อมูลชุมชน ไม่ใช่ประกาศเตือนภัยทางการ';
export const LONGDO_CREDIT_TH = 'ข้อมูลเหตุการณ์: iTIC / Longdo Traffic (CC-BY 4.0)';

/** Placeholder = gauge WL.STN.02. Committee replaces it with the village gate coordinates in Task 14 seed. */
export const VILLAGE_CENTER = { lat: 13.7771, lng: 100.73883 } as const;
export const PRIMARY_GAUGE = 'WL.STN.02';
```

- [ ] **Step 6: Run to verify it passes, then commit**

Run: `npx vitest run src/core/config.test.ts` → Expected: 2 passed.

```bash
git add -A && git commit -m "chore: scaffold Vite/React/TS app and shared constants"
```

---

### Task 3: Evidence rules and status engine (the safety core)

**Files:**
- Create: `src/core/types.ts`, `src/core/evidence.ts`, `src/core/status.ts`
- Test: `src/core/evidence.test.ts`, `src/core/status.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type RoadStatus = 'dry' | 'small_car' | 'high_clearance' | 'impassable'`; `type SegmentState = RoadStatus | 'unknown'`
  - `type ReportKind = 'road' | 'water_level' | 'supply' | 'general'`; `type VehicleClass = 'small_car' | 'high_clearance'`
  - `type SupplyStatus = 'open' | 'closed' | 'out_of_stock' | 'unreachable'`
  - `interface LatLng { lat: number; lng: number }`
  - `interface Report { id: string; kind: ReportKind; targetId: string; value: string; createdAt: number; hasEvidence: boolean; locationOk: boolean; byCommittee: boolean; confirmedByCommittee: boolean }`
  - `interface Resolved<V extends string> { value: V | 'unknown'; asOf: number | null; conflict: boolean; basisReportId: string | null }`
- Produces (`evidence.ts`): `requiresEvidence(kind: ReportKind, value: string): boolean`
- Produces (`status.ts`): `ROAD_SEVERITY`, `isEffective(r: Report, now: number, ttlMs: number): boolean`, `resolveRoad(reports: Report[], now: number, ttlMs: number): Resolved<RoadStatus>`, `resolveWaterLevel(reports, now, ttlMs): Resolved<string>` (value = level number as string; highest wins), `resolveSupply(reports, now, ttlMs): Resolved<SupplyStatus>` (newest wins), `resolveRoadSegments(reports: Report[], segmentIds: string[], now: number, ttlMs: number): Record<string, Resolved<RoadStatus>>`

- [ ] **Step 1: Write types**

```ts
// src/core/types.ts
export type RoadStatus = 'dry' | 'small_car' | 'high_clearance' | 'impassable';
export type SegmentState = RoadStatus | 'unknown';
export type ReportKind = 'road' | 'water_level' | 'supply' | 'general';
export type VehicleClass = 'small_car' | 'high_clearance';
export type SupplyStatus = 'open' | 'closed' | 'out_of_stock' | 'unreachable';

export interface LatLng { lat: number; lng: number }

export interface Report {
  id: string;
  kind: ReportKind;
  targetId: string;
  value: string;
  createdAt: number; // epoch ms
  hasEvidence: boolean;
  locationOk: boolean;
  byCommittee: boolean;
  confirmedByCommittee: boolean;
}

export interface Resolved<V extends string> {
  value: V | 'unknown';
  asOf: number | null;
  conflict: boolean;
  basisReportId: string | null;
}
```

- [ ] **Step 2: Write the failing evidence test**

```ts
// src/core/evidence.test.ts
import { requiresEvidence } from './evidence';

describe('requiresEvidence', () => {
  it.each(['dry', 'small_car', 'high_clearance'])('road %s needs evidence', (v) => {
    expect(requiresEvidence('road', v)).toBe(true);
  });
  it('road impassable does not', () => expect(requiresEvidence('road', 'impassable')).toBe(false));
  it('water level always needs evidence', () => expect(requiresEvidence('water_level', '2')).toBe(true));
  it('supply and general do not', () => {
    expect(requiresEvidence('supply', 'open')).toBe(false);
    expect(requiresEvidence('general', 'note')).toBe(false);
  });
});
```

Run: `npx vitest run src/core/evidence.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 3: Implement evidence rule**

```ts
// src/core/evidence.ts
import type { ReportKind } from './types';

/** Mirrors SQL function requires_evidence() in supabase/migrations/0002_rpc.sql — keep in sync. */
export function requiresEvidence(kind: ReportKind, value: string): boolean {
  if (kind === 'road') return value !== 'impassable';
  if (kind === 'water_level') return true;
  return false;
}
```

Run again → Expected: PASS.

- [ ] **Step 4: Write the failing status tests**

```ts
// src/core/status.test.ts
import { resolveRoad, resolveWaterLevel, resolveSupply, resolveRoadSegments, isEffective } from './status';
import { HOUR } from './config';
import type { Report } from './types';

const NOW = 1_000_000_000_000;
const TTL = 3 * HOUR;
let n = 0;
const rep = (o: Partial<Report> = {}): Report => ({
  id: `r${++n}`, kind: 'road', targetId: 'seg1', value: 'small_car', createdAt: NOW - 10 * 60_000,
  hasEvidence: true, locationOk: true, byCommittee: false, confirmedByCommittee: false, ...o,
});

describe('resolveRoad', () => {
  it('is unknown with no reports', () => {
    expect(resolveRoad([], NOW, TTL)).toEqual({ value: 'unknown', asOf: null, conflict: false, basisReportId: null });
  });
  it('is unknown once the only report has expired', () => {
    expect(resolveRoad([rep({ createdAt: NOW - TTL - 1 })], NOW, TTL).value).toBe('unknown');
  });
  it('uses a single valid report and records its time', () => {
    const r = rep({ value: 'dry' });
    expect(resolveRoad([r], NOW, TTL)).toMatchObject({ value: 'dry', asOf: r.createdAt, conflict: false, basisReportId: r.id });
  });
  it('shows the worse status and flags conflict when valid reports disagree', () => {
    const res = resolveRoad([rep({ value: 'dry' }), rep({ value: 'high_clearance' })], NOW, TTL);
    expect(res.value).toBe('high_clearance');
    expect(res.conflict).toBe(true);
  });
  it('ignores a passable claim that has no evidence', () => {
    expect(resolveRoad([rep({ value: 'small_car', hasEvidence: false })], NOW, TTL).value).toBe('unknown');
  });
  it('accepts impassable without evidence', () => {
    expect(resolveRoad([rep({ value: 'impassable', hasEvidence: false })], NOW, TTL).value).toBe('impassable');
  });
  it('ignores a report whose location does not match, unless a committee member confirmed it', () => {
    expect(resolveRoad([rep({ locationOk: false })], NOW, TTL).value).toBe('unknown');
    expect(resolveRoad([rep({ locationOk: false, confirmedByCommittee: true })], NOW, TTL).value).toBe('small_car');
  });
  it('ignores unrecognised values', () => {
    expect(resolveRoad([rep({ value: 'toString' })], NOW, TTL).value).toBe('unknown');
  });
  it('lets the newest committee report override older worse resident reports', () => {
    const res = resolveRoad([
      rep({ value: 'impassable', createdAt: NOW - 30 * 60_000 }),
      rep({ value: 'small_car', byCommittee: true, createdAt: NOW - 5 * 60_000 }),
    ], NOW, TTL);
    expect(res).toMatchObject({ value: 'small_car', conflict: false });
  });
  it('still shows a worse resident report that is newer than the committee report', () => {
    const res = resolveRoad([
      rep({ value: 'small_car', byCommittee: true, createdAt: NOW - 30 * 60_000 }),
      rep({ value: 'impassable', createdAt: NOW - 5 * 60_000 }),
    ], NOW, TTL);
    expect(res).toMatchObject({ value: 'impassable', conflict: true });
  });
});

describe('isEffective', () => {
  it('committee reports need no location match but still need evidence for passable claims', () => {
    expect(isEffective(rep({ byCommittee: true, locationOk: false }), NOW, TTL)).toBe(true);
    expect(isEffective(rep({ byCommittee: true, hasEvidence: false }), NOW, TTL)).toBe(false);
  });
});

describe('resolveWaterLevel', () => {
  it('takes the highest recent level', () => {
    const base = { kind: 'water_level' as const, targetId: 'mark1' };
    const res = resolveWaterLevel([rep({ ...base, value: '1' }), rep({ ...base, value: '3' })], NOW, 2 * HOUR);
    expect(res).toMatchObject({ value: '3', conflict: true });
  });
  it('expires after its own ttl', () => {
    const r = rep({ kind: 'water_level', targetId: 'mark1', value: '2', createdAt: NOW - 2 * HOUR - 1 });
    expect(resolveWaterLevel([r], NOW, 2 * HOUR).value).toBe('unknown');
  });
});

describe('resolveSupply', () => {
  it('newest report wins', () => {
    const base = { kind: 'supply' as const, targetId: 'p1', hasEvidence: false };
    const res = resolveSupply([
      rep({ ...base, value: 'open', createdAt: NOW - 60 * 60_000 }),
      rep({ ...base, value: 'out_of_stock', createdAt: NOW - 10 * 60_000 }),
    ], NOW, 12 * HOUR);
    expect(res.value).toBe('out_of_stock');
  });
  it('is unknown after 12 hours', () => {
    const r = rep({ kind: 'supply', targetId: 'p1', value: 'open', createdAt: NOW - 12 * HOUR - 1 });
    expect(resolveSupply([r], NOW, 12 * HOUR).value).toBe('unknown');
  });
});

describe('resolveRoadSegments', () => {
  it('returns an entry for every segment, unknown when no reports', () => {
    const out = resolveRoadSegments([rep({ targetId: 'a', value: 'dry' })], ['a', 'b'], NOW, TTL);
    expect(out.a?.value).toBe('dry');
    expect(out.b?.value).toBe('unknown');
  });
});
```

Run: `npx vitest run src/core/status.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 5: Implement the status engine**

```ts
// src/core/status.ts
import { requiresEvidence } from './evidence';
import type { Report, Resolved, RoadStatus, SupplyStatus } from './types';

export const ROAD_SEVERITY: Record<RoadStatus, number> = { dry: 0, small_car: 1, high_clearance: 2, impassable: 3 };
const SUPPLY_VALUES: readonly string[] = ['open', 'closed', 'out_of_stock', 'unreachable'];

const sev = (m: Record<string, number>) => (v: string): number | undefined => (Object.hasOwn(m, v) ? m[v] : undefined);
const levelSeverity = (v: string): number | undefined => (/^\d+$/.test(v) ? Number(v) : undefined);

function unknown<V extends string>(): Resolved<V> {
  return { value: 'unknown', asOf: null, conflict: false, basisReportId: null };
}

/** A report counts toward status only if unexpired, evidenced when required, and location-matched (or committee-vouched). */
export function isEffective(r: Report, now: number, ttlMs: number): boolean {
  if (now - r.createdAt >= ttlMs) return false;
  if (requiresEvidence(r.kind, r.value) && !r.hasEvidence) return false;
  if (!r.locationOk && !r.byCommittee && !r.confirmedByCommittee) return false;
  return true;
}

function resolveWorst<V extends string>(
  reports: Report[], now: number, ttlMs: number, severity: (v: string) => number | undefined,
): Resolved<V> {
  const valid = reports.filter((r) => severity(r.value) !== undefined && isEffective(r, now, ttlMs));
  if (valid.length === 0) return unknown<V>();

  const committee = valid.filter((r) => r.byCommittee).sort((a, b) => b.createdAt - a.createdAt)[0];
  // Newest committee report is authoritative, except a *newer* resident report is still considered (worse wins).
  const pool = committee ? [committee, ...valid.filter((r) => !r.byCommittee && r.createdAt > committee.createdAt)] : valid;

  const top = Math.max(...pool.map((r) => severity(r.value)!));
  const worst = pool.filter((r) => severity(r.value) === top);
  const newest = worst.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return {
    value: newest.value as V,
    asOf: newest.createdAt,
    conflict: new Set(pool.map((r) => r.value)).size > 1,
    basisReportId: newest.id,
  };
}

export const resolveRoad = (reports: Report[], now: number, ttlMs: number): Resolved<RoadStatus> =>
  resolveWorst<RoadStatus>(reports, now, ttlMs, sev(ROAD_SEVERITY));

export const resolveWaterLevel = (reports: Report[], now: number, ttlMs: number): Resolved<string> =>
  resolveWorst<string>(reports, now, ttlMs, levelSeverity);

export function resolveSupply(reports: Report[], now: number, ttlMs: number): Resolved<SupplyStatus> {
  const valid = reports.filter((r) => SUPPLY_VALUES.includes(r.value) && isEffective(r, now, ttlMs));
  if (valid.length === 0) return unknown<SupplyStatus>();
  const newest = valid.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return { value: newest.value as SupplyStatus, asOf: newest.createdAt, conflict: false, basisReportId: newest.id };
}

export function resolveRoadSegments(
  reports: Report[], segmentIds: string[], now: number, ttlMs: number,
): Record<string, Resolved<RoadStatus>> {
  const out: Record<string, Resolved<RoadStatus>> = {};
  for (const id of segmentIds) {
    out[id] = resolveRoad(reports.filter((r) => r.kind === 'road' && r.targetId === id), now, ttlMs);
  }
  return out;
}
```

- [ ] **Step 6: Run all core tests and commit**

Run: `npx vitest run src/core` → Expected: all pass.

```bash
git add src/core && git commit -m "feat(core): evidence rule and status engine with expiry/conflict/committee rules"
```

---

### Task 4: Route status, ranking, Google Maps link, geo helper

**Files:**
- Create: `src/core/geo.ts`, `src/core/routes.ts`
- Test: `src/core/geo.test.ts`, `src/core/routes.test.ts`

**Interfaces:**
- Consumes: `Resolved`, `RoadStatus`, `VehicleClass`, `LatLng` from `types.ts`; `GOOGLE_MAPS_MAX_WAYPOINTS` from `config.ts`.
- Produces (`geo.ts`): `haversineM(a: LatLng, b: LatLng): number`
- Produces (`routes.ts`):
  - `interface RouteDef { id: string; name: string; destinationId: string; segmentIds: string[]; waypoints: LatLng[]; distanceM: number }`
  - `type RouteState = 'ok' | 'unknown' | 'blocked'`
  - `interface RouteStatus { state: RouteState; blockedSegmentIds: string[]; unknownSegmentIds: string[]; hasConflict: boolean; oldestAsOf: number | null }`
  - `isPassable(vehicle: VehicleClass, status: RoadStatus): boolean`
  - `routeStatus(route: RouteDef, segments: Record<string, Resolved<RoadStatus>>, vehicle: VehicleClass): RouteStatus`
  - `rankRoutes<T extends { route: RouteDef; status: RouteStatus }>(items: T[]): T[]`
  - `pickWaypoints(points: LatLng[], max?: number): LatLng[]`
  - `buildGoogleMapsUrl(o: { origin: LatLng; destination: LatLng; waypoints: LatLng[] }): string`
  - `buildGoogleMapsSearchUrl(p: LatLng): string`

- [ ] **Step 1: Write the failing geo test**

```ts
// src/core/geo.test.ts
import { haversineM } from './geo';

it('computes distance between two known gauges (~2.7 km)', () => {
  const d = haversineM({ lat: 13.7771, lng: 100.73883 }, { lat: 13.7699, lng: 100.7149 });
  expect(d).toBeGreaterThan(2650);
  expect(d).toBeLessThan(2760);
});
it('is zero for identical points', () => {
  expect(haversineM({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
});
```

Run: `npx vitest run src/core/geo.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implement geo**

```ts
// src/core/geo.ts
import type { LatLng } from './types';

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
```

Run again → Expected: PASS.

- [ ] **Step 3: Write the failing routes test**

```ts
// src/core/routes.test.ts
import { isPassable, routeStatus, rankRoutes, pickWaypoints, buildGoogleMapsUrl, buildGoogleMapsSearchUrl, type RouteDef } from './routes';
import type { Resolved, RoadStatus } from './types';

const seg = (value: Resolved<RoadStatus>['value'], asOf: number | null = 1000, conflict = false): Resolved<RoadStatus> =>
  ({ value, asOf, conflict, basisReportId: null });
const route = (segmentIds: string[], distanceM = 1000, id = 'r'): RouteDef =>
  ({ id, name: id, destinationId: 'd', segmentIds, waypoints: [], distanceM });

describe('isPassable', () => {
  it('small car: only dry and small_car', () => {
    expect(isPassable('small_car', 'dry')).toBe(true);
    expect(isPassable('small_car', 'small_car')).toBe(true);
    expect(isPassable('small_car', 'high_clearance')).toBe(false);
    expect(isPassable('small_car', 'impassable')).toBe(false);
  });
  it('high clearance: everything except impassable', () => {
    expect(isPassable('high_clearance', 'high_clearance')).toBe(true);
    expect(isPassable('high_clearance', 'impassable')).toBe(false);
  });
});

describe('routeStatus', () => {
  const segs = { a: seg('dry', 3000), b: seg('high_clearance', 2000), c: seg('unknown', null), d: seg('impassable', 4000, true) };
  it('ok when every segment passable; reports the oldest segment time', () => {
    expect(routeStatus(route(['a']), segs, 'small_car')).toMatchObject({ state: 'ok', oldestAsOf: 3000 });
  });
  it('same route differs by vehicle class', () => {
    expect(routeStatus(route(['a', 'b']), segs, 'small_car').state).toBe('blocked');
    expect(routeStatus(route(['a', 'b']), segs, 'high_clearance').state).toBe('ok');
  });
  it('unknown segment makes the whole route unknown, and lists it', () => {
    expect(routeStatus(route(['a', 'c']), segs, 'small_car')).toMatchObject({ state: 'unknown', unknownSegmentIds: ['c'], oldestAsOf: 3000 });
  });
  it('blocked beats unknown', () => {
    expect(routeStatus(route(['c', 'd']), segs, 'high_clearance')).toMatchObject({ state: 'blocked', blockedSegmentIds: ['d'], unknownSegmentIds: ['c'] });
  });
  it('treats a segment missing from the map as unknown, never ok', () => {
    expect(routeStatus(route(['zzz']), segs, 'small_car').state).toBe('unknown');
  });
  it('propagates conflict', () => {
    expect(routeStatus(route(['d']), segs, 'small_car').hasConflict).toBe(true);
  });
  it('an empty route is unknown, never ok', () => {
    expect(routeStatus(route([]), segs, 'small_car').state).toBe('unknown');
  });
});

describe('rankRoutes', () => {
  const mk = (id: string, state: 'ok' | 'unknown' | 'blocked', distanceM: number) => ({
    route: route([], distanceM, id),
    status: { state, blockedSegmentIds: [], unknownSegmentIds: [], hasConflict: false, oldestAsOf: null },
  });
  it('orders ok < unknown < blocked, then by distance', () => {
    const ranked = rankRoutes([mk('blocked-short', 'blocked', 100), mk('unk', 'unknown', 200), mk('ok-long', 'ok', 900), mk('ok-short', 'ok', 500)]);
    expect(ranked.map((x) => x.route.id)).toEqual(['ok-short', 'ok-long', 'unk', 'blocked-short']);
  });
});

describe('pickWaypoints', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ lat: i, lng: i }));
  it('returns all when within the limit', () => expect(pickWaypoints(pts.slice(0, 2))).toHaveLength(2));
  it('reduces to the limit with unique interior points in order', () => {
    const out = pickWaypoints(pts, 3);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((p) => p.lat)).size).toBe(3);
    expect(out.map((p) => p.lat)).toEqual([...out.map((p) => p.lat)].sort((a, b) => a - b));
  });
});

describe('buildGoogleMapsUrl', () => {
  it('builds a driving navigation link with pipe-separated waypoints', () => {
    const url = new URL(buildGoogleMapsUrl({
      origin: { lat: 13.1, lng: 100.1 }, destination: { lat: 13.9, lng: 100.9 },
      waypoints: [{ lat: 13.3, lng: 100.3 }, { lat: 13.5, lng: 100.5 }],
    }));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('13.1,100.1');
    expect(url.searchParams.get('destination')).toBe('13.9,100.9');
    expect(url.searchParams.get('waypoints')).toBe('13.3,100.3|13.5,100.5');
    expect(url.searchParams.get('travelmode')).toBe('driving');
  });
  it('never emits more than 3 waypoints', () => {
    const wps = Array.from({ length: 8 }, (_, i) => ({ lat: 13 + i / 100, lng: 100 }));
    const url = new URL(buildGoogleMapsUrl({ origin: { lat: 13, lng: 100 }, destination: { lat: 14, lng: 100 }, waypoints: wps }));
    expect(url.searchParams.get('waypoints')!.split('|').length).toBeLessThanOrEqual(3);
  });
  it('omits waypoints when there are none', () => {
    const url = new URL(buildGoogleMapsUrl({ origin: { lat: 1, lng: 1 }, destination: { lat: 2, lng: 2 }, waypoints: [] }));
    expect(url.searchParams.has('waypoints')).toBe(false);
  });
});

it('builds a search link', () => {
  expect(buildGoogleMapsSearchUrl({ lat: 13.7, lng: 100.7 })).toBe('https://www.google.com/maps/search/?api=1&query=13.7%2C100.7');
});
```

Run: `npx vitest run src/core/routes.test.ts` → Expected: FAIL.

- [ ] **Step 4: Implement routes**

```ts
// src/core/routes.ts
import { GOOGLE_MAPS_MAX_WAYPOINTS } from './config';
import type { LatLng, Resolved, RoadStatus, VehicleClass } from './types';

export interface RouteDef { id: string; name: string; destinationId: string; segmentIds: string[]; waypoints: LatLng[]; distanceM: number }
export type RouteState = 'ok' | 'unknown' | 'blocked';
export interface RouteStatus {
  state: RouteState; blockedSegmentIds: string[]; unknownSegmentIds: string[]; hasConflict: boolean; oldestAsOf: number | null;
}

export function isPassable(vehicle: VehicleClass, status: RoadStatus): boolean {
  if (status === 'dry' || status === 'small_car') return true;
  if (status === 'high_clearance') return vehicle === 'high_clearance';
  return false;
}

export function routeStatus(route: RouteDef, segments: Record<string, Resolved<RoadStatus>>, vehicle: VehicleClass): RouteStatus {
  const blocked: string[] = [];
  const unknown: string[] = [];
  let conflict = false;
  let oldest: number | null = null;
  for (const id of route.segmentIds) {
    const s = segments[id];
    if (!s || s.value === 'unknown') { unknown.push(id); continue; }
    if (s.conflict) conflict = true;
    if (s.asOf !== null) oldest = oldest === null ? s.asOf : Math.min(oldest, s.asOf);
    if (!isPassable(vehicle, s.value)) blocked.push(id);
  }
  const state: RouteState = blocked.length ? 'blocked' : unknown.length || route.segmentIds.length === 0 ? 'unknown' : 'ok';
  return { state, blockedSegmentIds: blocked, unknownSegmentIds: unknown, hasConflict: conflict, oldestAsOf: oldest };
}

const STATE_ORDER: Record<RouteState, number> = { ok: 0, unknown: 1, blocked: 2 };

export function rankRoutes<T extends { route: RouteDef; status: RouteStatus }>(items: T[]): T[] {
  return [...items].sort((a, b) => STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state] || a.route.distanceM - b.route.distanceM);
}

export function pickWaypoints(points: LatLng[], max = GOOGLE_MAPS_MAX_WAYPOINTS): LatLng[] {
  if (points.length <= max) return points;
  const idx = new Set<number>();
  for (let i = 1; i <= max; i++) idx.add(Math.min(points.length - 1, Math.floor((i * points.length) / (max + 1))));
  return [...idx].sort((a, b) => a - b).map((i) => points[i]!);
}

const ll = (p: LatLng) => `${p.lat},${p.lng}`;

export function buildGoogleMapsUrl(o: { origin: LatLng; destination: LatLng; waypoints: LatLng[] }): string {
  const q = new URLSearchParams({ api: '1', origin: ll(o.origin), destination: ll(o.destination) });
  const wps = pickWaypoints(o.waypoints);
  if (wps.length) q.set('waypoints', wps.map(ll).join('|'));
  q.set('travelmode', 'driving');
  q.set('dir_action', 'navigate');
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

export function buildGoogleMapsSearchUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: ll(p) }).toString()}`;
}
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/core` → Expected: all pass.

```bash
git add src/core && git commit -m "feat(core): route status per vehicle class, ranking, Google Maps links"
```

---

### Task 5: Agency freshness, trend, gauge state, Thai formatting, labels

**Files:**
- Create: `src/core/agency.ts`, `src/core/format.ts`, `src/core/labels.ts`
- Test: `src/core/agency.test.ts`, `src/core/format.test.ts`, `src/core/labels.test.ts`

**Interfaces:**
- Consumes: `MINUTE`, `HOUR` from `config.ts`; `SegmentState`, `VehicleClass`, `SupplyStatus` from `types.ts`.
- Produces (`agency.ts`): `freshness(observedAt: number, now: number, maxAgeMs: number): { ageMs: number; stale: boolean }`; `interface Sample { t: number; v: number }`; `type Trend = 'rising' | 'falling' | 'steady' | 'unknown'`; `trend(samples: Sample[], now: number, opts?: { windowMs?: number; epsilon?: number; minSpanMs?: number }): Trend`; `type GaugeState = 'uncalibrated' | 'stale' | 'normal' | 'watch' | 'danger'`; `gaugeState(value: number, thresholds: { watch: number; danger: number } | null, stale: boolean): GaugeState`
- Produces (`format.ts`): `formatAgeTh(ageMs: number): string`
- Produces (`labels.ts`): `STATUS_LABEL_TH: Record<SegmentState, string>`, `STATUS_COLOR: Record<SegmentState, string>`, `VEHICLE_LABEL_TH: Record<VehicleClass, string>`, `SUPPLY_LABEL_TH: Record<SupplyStatus | 'unknown', string>`, `TREND_LABEL_TH: Record<Trend, string>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/core/agency.test.ts
import { freshness, trend, gaugeState } from './agency';
import { MINUTE, HOUR } from './config';

const NOW = 1_000_000_000_000;

describe('freshness', () => {
  it('is fresh within max age', () => expect(freshness(NOW - 10 * MINUTE, NOW, HOUR)).toEqual({ ageMs: 10 * MINUTE, stale: false }));
  it('is stale beyond max age', () => expect(freshness(NOW - 61 * MINUTE, NOW, HOUR).stale).toBe(true));
  it('never reports negative age (clock skew)', () => expect(freshness(NOW + 5000, NOW, HOUR).ageMs).toBe(0));
});

describe('trend', () => {
  const s = (minAgo: number, v: number) => ({ t: NOW - minAgo * MINUTE, v });
  it('rising', () => expect(trend([s(60, 0.5), s(30, 0.6), s(0, 0.72)], NOW)).toBe('rising'));
  it('falling', () => expect(trend([s(60, 0.9), s(0, 0.7)], NOW)).toBe('falling'));
  it('steady within epsilon', () => expect(trend([s(60, 0.7), s(0, 0.71)], NOW)).toBe('steady'));
  it('unknown with a single sample', () => expect(trend([s(0, 0.7)], NOW)).toBe('unknown'));
  it('unknown when samples span less than 20 minutes', () => expect(trend([s(10, 0.5), s(0, 0.9)], NOW)).toBe('unknown'));
  it('ignores samples older than the window', () => expect(trend([s(400, 0.1), s(0, 0.7)], NOW)).toBe('unknown'));
});

describe('gaugeState', () => {
  const th = { watch: 0.5, danger: 0.8 };
  it('is uncalibrated without thresholds (no colour)', () => expect(gaugeState(2, null, false)).toBe('uncalibrated'));
  it('is stale when data is stale, regardless of value', () => expect(gaugeState(2, th, true)).toBe('stale'));
  it('classifies by threshold', () => {
    expect(gaugeState(0.4, th, false)).toBe('normal');
    expect(gaugeState(0.5, th, false)).toBe('watch');
    expect(gaugeState(0.8, th, false)).toBe('danger');
  });
});
```

```ts
// src/core/format.test.ts
import { formatAgeTh } from './format';
import { MINUTE, HOUR } from './config';

describe('formatAgeTh', () => {
  it.each([
    [0, 'เมื่อสักครู่'],
    [59_000, 'เมื่อสักครู่'],
    [5 * MINUTE, '5 นาทีที่แล้ว'],
    [59 * MINUTE, '59 นาทีที่แล้ว'],
    [2 * HOUR + 10 * MINUTE, '2 ชั่วโมงที่แล้ว'],
    [26 * HOUR, '1 วันที่แล้ว'],
  ])('%i ms → %s', (ms, text) => expect(formatAgeTh(ms)).toBe(text));
});
```

```ts
// src/core/labels.test.ts
import { STATUS_LABEL_TH, STATUS_COLOR } from './labels';

const ALL = ['dry', 'small_car', 'high_clearance', 'impassable', 'unknown'] as const;

it('labels all five states in Thai exactly as specified', () => {
  expect(STATUS_LABEL_TH).toEqual({ dry: 'แห้ง', small_car: 'รถเล็กไปได้', high_clearance: 'รถยกสูงเท่านั้น', impassable: 'ผ่านไม่ได้', unknown: 'ไม่ทราบ' });
});
it('gives each state a distinct colour so unknown is never mistaken for dry', () => {
  expect(new Set(ALL.map((s) => STATUS_COLOR[s])).size).toBe(5);
});
```

Run: `npx vitest run src/core/agency.test.ts src/core/format.test.ts src/core/labels.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// src/core/agency.ts
import { HOUR, MINUTE } from './config';

export function freshness(observedAt: number, now: number, maxAgeMs: number) {
  const ageMs = Math.max(0, now - observedAt);
  return { ageMs, stale: ageMs > maxAgeMs };
}

export interface Sample { t: number; v: number }
export type Trend = 'rising' | 'falling' | 'steady' | 'unknown';

export function trend(samples: Sample[], now: number, opts: { windowMs?: number; epsilon?: number; minSpanMs?: number } = {}): Trend {
  const { windowMs = 3 * HOUR, epsilon = 0.02, minSpanMs = 20 * MINUTE } = opts;
  const inWindow = samples.filter((x) => now - x.t <= windowMs).sort((a, b) => a.t - b.t);
  if (inWindow.length < 2) return 'unknown';
  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;
  if (last.t - first.t < minSpanMs) return 'unknown';
  const delta = last.v - first.v;
  if (delta > epsilon) return 'rising';
  if (delta < -epsilon) return 'falling';
  return 'steady';
}

export type GaugeState = 'uncalibrated' | 'stale' | 'normal' | 'watch' | 'danger';

export function gaugeState(value: number, thresholds: { watch: number; danger: number } | null, stale: boolean): GaugeState {
  if (!thresholds) return 'uncalibrated';
  if (stale) return 'stale';
  if (value >= thresholds.danger) return 'danger';
  if (value >= thresholds.watch) return 'watch';
  return 'normal';
}
```

```ts
// src/core/format.ts
import { HOUR, MINUTE } from './config';

const DAY = 24 * HOUR;

export function formatAgeTh(ageMs: number): string {
  if (ageMs < MINUTE) return 'เมื่อสักครู่';
  if (ageMs < HOUR) return `${Math.floor(ageMs / MINUTE)} นาทีที่แล้ว`;
  if (ageMs < DAY) return `${Math.floor(ageMs / HOUR)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(ageMs / DAY)} วันที่แล้ว`;
}
```

```ts
// src/core/labels.ts
import type { SegmentState, SupplyStatus, VehicleClass } from './types';
import type { Trend } from './agency';

export const STATUS_LABEL_TH: Record<SegmentState, string> = {
  dry: 'แห้ง', small_car: 'รถเล็กไปได้', high_clearance: 'รถยกสูงเท่านั้น', impassable: 'ผ่านไม่ได้', unknown: 'ไม่ทราบ',
};
export const STATUS_COLOR: Record<SegmentState, string> = {
  dry: '#1a9850', small_car: '#7fbf3f', high_clearance: '#f2a900', impassable: '#d73027', unknown: '#8a8f98',
};
export const VEHICLE_LABEL_TH: Record<VehicleClass, string> = { small_car: 'รถเล็ก', high_clearance: 'รถยกสูง' };
export const SUPPLY_LABEL_TH: Record<SupplyStatus | 'unknown', string> = {
  open: 'เปิด', closed: 'ปิด', out_of_stock: 'ของหมด', unreachable: 'เข้าถึงไม่ได้', unknown: 'ไม่ทราบ',
};
export const TREND_LABEL_TH: Record<Trend, string> = { rising: 'กำลังขึ้น', falling: 'กำลังลง', steady: 'ทรงตัว', unknown: 'ยังไม่พอประเมินแนวโน้ม' };
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run src/core` → Expected: all pass.

```bash
git add src/core && git commit -m "feat(core): agency freshness/trend/gauge state, Thai age formatting and labels"
```

---

### Task 6: Supabase schema, RPCs, RLS, seed, and DB integration tests

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_rpc.sql`, `supabase/seed.sql`
- Test: `tests/db/submit_report.int.test.ts`
- Modify: `package.json` (script `test:db`)

**Interfaces:**
- Produces (SQL objects the app and poller use):
  - Tables: `segments(id, name, geojson, geom, sort)`, `water_marks(id, name, geojson, geom, levels)`, `places(id, name, category, geojson, geom)`, `destinations(id, name, kind, lat, lng)`, `routes(id, name, destination_id, segment_ids, waypoints, distance_m)`, `devices`, `reports`, `confirmations`, `settings(key, value)`, `agency_readings`, `agency_warnings`, `incidents`, `committee_members`
  - Views (public read): `reports_public`, `agency_latest`, `agency_recent`
  - RPC: `submit_report(p_device uuid, p_nickname text, p_kind text, p_target text, p_value text, p_lat double precision, p_lng double precision, p_media_path text, p_media_type text, p_note text) returns uuid`; `confirm_report(p_device uuid, p_report uuid) returns void`; `moderate_report(p_report uuid, p_action text) returns void` (`'confirm' | 'delete'`, committee only); `server_time() returns timestamptz`; `is_committee() returns boolean`
  - Error codes (the exception message text): `device_blocked`, `rate_limited`, `invalid_value`, `unknown_target`, `evidence_required`, `committee_only`, `nickname_required`
  - Storage bucket `evidence` (public read, anon upload, 25 MB, image/video MIME types)

- [ ] **Step 1: Check tooling**

Run: `docker --version && supabase --version`
Expected: both print versions. If Docker is missing, use a hosted Supabase **dev** project instead: create it in the Supabase dashboard, run `supabase link --project-ref <ref>`, and apply with `supabase db push` in later steps (never run tests against the production project).

- [ ] **Step 2: Initialise Supabase**

```bash
supabase init
supabase start   # local only; prints API URL, anon key, service_role key → copy into .env
```

- [ ] **Step 3: Write the schema migration**

```sql
-- supabase/migrations/0001_schema.sql
create extension if not exists postgis with schema extensions;

create or replace function set_geom() returns trigger language plpgsql as $$
begin
  new.geom := extensions.st_setsrid(extensions.st_geomfromgeojson(new.geojson::text), 4326)::extensions.geography;
  return new;
end $$;

create table segments (
  id text primary key, name text not null, geojson jsonb not null, geom extensions.geography, sort int not null default 0
);
create table water_marks (
  id text primary key, name text not null, geojson jsonb not null, geom extensions.geography,
  levels jsonb not null  -- [{"level":1,"label":"ขีดที่ 1"}, ...]
);
create table places (
  id text primary key, name text not null,
  category text not null check (category in ('food','market','store','fuel','hospital')),
  geojson jsonb not null, geom extensions.geography
);
create trigger segments_geom before insert or update of geojson on segments for each row execute function set_geom();
create trigger marks_geom before insert or update of geojson on water_marks for each row execute function set_geom();
create trigger places_geom before insert or update of geojson on places for each row execute function set_geom();

create table destinations (
  id text primary key, name text not null, kind text not null, lat double precision not null, lng double precision not null
);
create table routes (
  id text primary key, name text not null, destination_id text not null references destinations(id),
  segment_ids text[] not null, waypoints jsonb not null default '[]', distance_m int not null check (distance_m > 0)
);

create table devices (
  id uuid primary key, nickname text not null, blocked boolean not null default false, created_at timestamptz not null default now()
);
create table reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('road','water_level','supply','general')),
  target_id text not null, value text not null,
  device_id uuid not null references devices(id), nickname text not null,
  created_at timestamptz not null default now(),
  lat double precision, lng double precision, location_ok boolean not null,
  media_path text, media_type text, note text,
  by_committee boolean not null default false,
  confirmed_by_committee boolean not null default false,
  deleted boolean not null default false
);
create index reports_recent on reports (created_at desc);
create index reports_target on reports (kind, target_id, created_at desc);
create table confirmations (
  report_id uuid references reports(id) on delete cascade, device_id uuid references devices(id),
  created_at timestamptz not null default now(), primary key (report_id, device_id)
);

create table settings (key text primary key, value jsonb not null);
insert into settings (key, value) values
  ('ttl_ms', '{"road":10800000,"water_level":7200000,"supply":43200000}'),
  ('agency_max_age_ms', '3600000'),
  ('gauge_thresholds', '{}');   -- e.g. {"WL.STN.02":{"watch":0.5,"danger":0.8}} set by committee

create table agency_readings (
  source text not null, station_id text not null, station_name text not null,
  lat double precision, lng double precision,
  metric text not null, value double precision not null, unit text not null,
  observed_at timestamptz not null, fetched_at timestamptz not null default now(),
  primary key (source, station_id, metric, observed_at)
);
create table agency_warnings (
  id text primary key, source text not null, title text not null, body text not null, url text,
  issued_at timestamptz not null, mentions_bangkok boolean not null default false, fetched_at timestamptz not null default now()
);
create table incidents (
  id text primary key, source text not null, title text not null,
  lat double precision not null, lng double precision not null, severity int,
  start_at timestamptz not null, stop_at timestamptz not null, fetched_at timestamptz not null default now()
);
create table committee_members (user_id uuid primary key references auth.users(id) on delete cascade);

create view agency_latest as
  select distinct on (source, station_id, metric) * from agency_readings order by source, station_id, metric, observed_at desc;
create view agency_recent as
  select * from agency_readings where observed_at > now() - interval '6 hours';
create view reports_public as
  select r.id, r.kind, r.target_id, r.value, r.nickname, r.created_at, r.lat, r.lng, r.location_ok,
         r.media_path, r.media_type, r.note, r.by_committee, r.confirmed_by_committee,
         (select count(*) from confirmations c where c.report_id = r.id) as confirmations
  from reports r where not r.deleted and r.created_at > now() - interval '7 days';

-- Storage bucket for evidence
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', true, 26214400, array['image/jpeg','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;
create policy "anyone can upload evidence" on storage.objects for insert to anon, authenticated with check (bucket_id = 'evidence');
```

- [ ] **Step 4: Write the RPC + RLS migration**

```sql
-- supabase/migrations/0002_rpc.sql
create or replace function is_committee() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from committee_members where user_id = auth.uid())
$$;
create or replace function server_time() returns timestamptz language sql stable as $$ select now() $$;

-- Mirrors src/core/evidence.ts requiresEvidence() — keep in sync.
create or replace function requires_evidence(p_kind text, p_value text) returns boolean language sql immutable as $$
  select case p_kind when 'road' then p_value <> 'impassable' when 'water_level' then true else false end
$$;

create or replace function submit_report(
  p_device uuid, p_nickname text, p_kind text, p_target text, p_value text,
  p_lat double precision, p_lng double precision,
  p_media_path text default null, p_media_type text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_committee boolean := is_committee();
  v_geom geography; v_max double precision := 150; v_ok boolean; v_id uuid;
begin
  if p_nickname is null or length(trim(p_nickname)) = 0 then raise exception 'nickname_required'; end if;

  insert into devices (id, nickname) values (p_device, left(trim(p_nickname), 40))
    on conflict (id) do update set nickname = excluded.nickname;
  if (select blocked from devices where id = p_device) then raise exception 'device_blocked'; end if;
  if (select count(*) from reports where device_id = p_device and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate_limited';
  end if;

  -- validate value per kind
  if p_kind = 'road' and p_value not in ('dry','small_car','high_clearance','impassable') then raise exception 'invalid_value'; end if;
  if p_kind = 'supply' and p_value not in ('open','closed','out_of_stock','unreachable') then raise exception 'invalid_value'; end if;
  if p_kind = 'water_level' and not exists (
    select 1 from water_marks m, jsonb_array_elements(m.levels) l where m.id = p_target and (l->>'level') = p_value
  ) then raise exception 'invalid_value'; end if;
  if p_kind = 'general' then
    if p_value <> 'note' or p_note is null or length(trim(p_note)) = 0 then raise exception 'invalid_value'; end if;
    if p_target not in ('village','wall','drainage') then raise exception 'unknown_target'; end if;
    if p_target in ('wall','drainage') and not v_committee then raise exception 'committee_only'; end if;
  end if;
  if p_kind not in ('road','water_level','supply','general') then raise exception 'invalid_value'; end if;

  if requires_evidence(p_kind, p_value) and p_media_path is null then raise exception 'evidence_required'; end if;

  -- target geometry and distance limit (metres)
  if p_kind = 'road' then select geom into v_geom from segments where id = p_target; v_max := 150;
  elsif p_kind = 'water_level' then select geom into v_geom from water_marks where id = p_target; v_max := 100;
  elsif p_kind = 'supply' then select geom into v_geom from places where id = p_target; v_max := 150;
  end if;
  if p_kind <> 'general' and v_geom is null then raise exception 'unknown_target'; end if;

  v_ok := case
    when p_kind = 'general' then true
    when p_lat is null or p_lng is null then false
    else st_distance(v_geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) <= v_max
  end;

  insert into reports (kind, target_id, value, device_id, nickname, lat, lng, location_ok, media_path, media_type, note, by_committee)
  values (p_kind, p_target, p_value, p_device, left(trim(p_nickname), 40), p_lat, p_lng, v_ok, p_media_path, p_media_type, left(p_note, 500), v_committee)
  returning id into v_id;
  return v_id;
end $$;

create or replace function confirm_report(p_device uuid, p_report uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select device_id from reports where id = p_report) = p_device then return; end if; -- cannot confirm own report
  insert into devices (id, nickname) values (p_device, 'ผู้ใช้') on conflict (id) do nothing;
  insert into confirmations (report_id, device_id) values (p_report, p_device) on conflict do nothing;
end $$;

create or replace function moderate_report(p_report uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_committee() then raise exception 'committee_only'; end if;
  if p_action = 'confirm' then update reports set confirmed_by_committee = true where id = p_report;
  elsif p_action = 'delete' then update reports set deleted = true where id = p_report;
  else raise exception 'invalid_value'; end if;
end $$;

grant execute on function submit_report, confirm_report, moderate_report, server_time, is_committee to anon, authenticated;

-- RLS: reads public on reference data; reports only via view/RPC; committee manages content
alter table segments enable row level security;       alter table water_marks enable row level security;
alter table places enable row level security;         alter table destinations enable row level security;
alter table routes enable row level security;         alter table settings enable row level security;
alter table devices enable row level security;        alter table reports enable row level security;
alter table confirmations enable row level security;  alter table agency_readings enable row level security;
alter table agency_warnings enable row level security; alter table incidents enable row level security;
alter table committee_members enable row level security;

do $$ declare t text; begin
  foreach t in array array['segments','water_marks','places','destinations','routes','settings','agency_readings','agency_warnings','incidents'] loop
    execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
  end loop;
  foreach t in array array['segments','water_marks','places','destinations','routes','settings'] loop
    execute format('create policy "committee write" on %I for all to authenticated using (is_committee()) with check (is_committee())', t);
  end loop;
end $$;

create policy "committee reads reports" on reports for select to authenticated using (is_committee());
create policy "committee manages devices" on devices for all to authenticated using (is_committee()) with check (is_committee());
create policy "self membership" on committee_members for select to authenticated using (user_id = auth.uid());

grant select on reports_public, agency_latest, agency_recent to anon, authenticated;
```

- [ ] **Step 5: Write demo seed (local/dev only)**

```sql
-- supabase/seed.sql — DEMO data for local development. Replace with real data in Task 14.
insert into segments (id, name, geojson) values
  ('seg-demo-1', 'ซอยตัวอย่าง 1', '{"type":"LineString","coordinates":[[100.7380,13.7765],[100.7400,13.7775]]}'),
  ('seg-demo-2', 'ถนนตัวอย่าง 2', '{"type":"LineString","coordinates":[[100.7400,13.7775],[100.7440,13.7790]]}');
insert into water_marks (id, name, geojson, levels) values
  ('mark-demo-wall', 'กำแพงริมคลอง (ตัวอย่าง)', '{"type":"Point","coordinates":[100.7385,13.7768]}',
   '[{"level":1,"label":"ขีดที่ 1"},{"level":2,"label":"ขีดที่ 2"},{"level":3,"label":"ขีดที่ 3"}]');
insert into places (id, name, category, geojson) values
  ('place-demo-1', 'ร้านสะดวกซื้อ (ตัวอย่าง)', 'store', '{"type":"Point","coordinates":[100.7420,13.7780]}');
insert into destinations (id, name, kind, lat, lng) values
  ('dest-demo-airport-link', 'สถานีลาดกระบัง (ตัวอย่าง)', 'station', 13.7273, 100.7517);
insert into routes (id, name, destination_id, segment_ids, waypoints, distance_m) values
  ('route-demo-1', 'เส้นตัวอย่าง', 'dest-demo-airport-link', array['seg-demo-1','seg-demo-2'], '[]', 6500);
```

- [ ] **Step 6: Apply and sanity-check**

Run: `supabase db reset`
Expected: migrations 0001 and 0002 applied, seed loaded, no errors. Then:

Run: `supabase db query "select id, st_length(geom) from segments"` (or open Studio at the printed URL)
Expected: two rows with non-null lengths (confirms the geom trigger works).

- [ ] **Step 7: Write the failing integration test**

```ts
// tests/db/submit_report.int.test.ts
// Run: npm run test:db   (needs a LOCAL or DEV Supabase with seed.sql applied; reads .env)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const anon = createClient(url, process.env.SUPABASE_ANON_KEY!);
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const NEAR = { lat: 13.7770, lng: 100.7390 }; // within 150 m of seg-demo-1
const FAR = { lat: 13.8500, lng: 100.9000 };
const submit = (device: string, o: Record<string, unknown>) =>
  anon.rpc('submit_report', {
    p_device: device, p_nickname: 'ทดสอบ', p_kind: 'road', p_target: 'seg-demo-1', p_value: 'impassable',
    p_lat: NEAR.lat, p_lng: NEAR.lng, p_media_path: null, p_media_type: null, p_note: null, ...o,
  });

describe('submit_report', () => {
  it('rejects a passable road claim without evidence', async () => {
    const { error } = await submit(crypto.randomUUID(), { p_value: 'small_car' });
    expect(error?.message).toContain('evidence_required');
  });
  it('rejects water-level reports without evidence', async () => {
    const { error } = await submit(crypto.randomUUID(), { p_kind: 'water_level', p_target: 'mark-demo-wall', p_value: '2' });
    expect(error?.message).toContain('evidence_required');
  });
  it('accepts impassable without evidence', async () => {
    const { data, error } = await submit(crypto.randomUUID(), {});
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });
  it('flags location_ok=true near the segment and false far away', async () => {
    const dev = crypto.randomUUID();
    const a = await submit(dev, { p_value: 'dry', p_media_path: `${dev}/a.jpg`, p_media_type: 'image/jpeg' });
    const b = await submit(dev, { p_value: 'dry', p_media_path: `${dev}/b.jpg`, p_media_type: 'image/jpeg', p_lat: FAR.lat, p_lng: FAR.lng });
    const { data } = await service.from('reports').select('id, location_ok').in('id', [a.data, b.data]);
    expect(data!.find((r) => r.id === a.data)!.location_ok).toBe(true);
    expect(data!.find((r) => r.id === b.data)!.location_ok).toBe(false);
  });
  it('flags location_ok=false when no coordinates are sent', async () => {
    const dev = crypto.randomUUID();
    const r = await submit(dev, { p_lat: null, p_lng: null });
    const { data } = await service.from('reports').select('location_ok').eq('id', r.data).single();
    expect(data!.location_ok).toBe(false);
  });
  it('rejects unknown target, invalid value, empty nickname', async () => {
    expect((await submit(crypto.randomUUID(), { p_target: 'nope' })).error?.message).toContain('unknown_target');
    expect((await submit(crypto.randomUUID(), { p_value: 'flying' })).error?.message).toContain('invalid_value');
    expect((await submit(crypto.randomUUID(), { p_nickname: '  ' })).error?.message).toContain('nickname_required');
  });
  it('rejects water level values that are not on the mark', async () => {
    const dev = crypto.randomUUID();
    const { error } = await submit(dev, { p_kind: 'water_level', p_target: 'mark-demo-wall', p_value: '9', p_media_path: `${dev}/x.jpg` });
    expect(error?.message).toContain('invalid_value');
  });
  it('blocks committee-only general targets for residents', async () => {
    const { error } = await submit(crypto.randomUUID(), { p_kind: 'general', p_target: 'wall', p_value: 'note', p_note: 'x' });
    expect(error?.message).toContain('committee_only');
  });
  it('rate-limits a device at 10 reports per 10 minutes', async () => {
    const dev = crypto.randomUUID();
    for (let i = 0; i < 10; i++) expect((await submit(dev, {})).error).toBeNull();
    expect((await submit(dev, {})).error?.message).toContain('rate_limited');
  });
  it('rejects blocked devices', async () => {
    const dev = crypto.randomUUID();
    await submit(dev, {});
    await service.from('devices').update({ blocked: true }).eq('id', dev);
    expect((await submit(dev, {})).error?.message).toContain('device_blocked');
  });
});

describe('access control', () => {
  it('anon cannot read the raw reports table (no device ids)', async () => {
    const { data } = await anon.from('reports').select('*').limit(1);
    expect(data ?? []).toHaveLength(0);
  });
  it('anon cannot insert directly into reports', async () => {
    const dev = crypto.randomUUID();
    const { error } = await anon.from('reports').insert({ kind: 'road', target_id: 'seg-demo-1', value: 'dry', device_id: dev, nickname: 'x', location_ok: true });
    expect(error).not.toBeNull();
  });
  it('reports_public hides device_id and is readable', async () => {
    const { data, error } = await anon.from('reports_public').select('*').limit(1);
    expect(error).toBeNull();
    if (data?.length) expect(data[0]).not.toHaveProperty('device_id');
  });
  it('anon cannot moderate', async () => {
    const { error } = await anon.rpc('moderate_report', { p_report: crypto.randomUUID(), p_action: 'delete' });
    expect(error?.message).toContain('committee_only');
  });
  it('anon cannot change settings', async () => {
    await anon.from('settings').update({ value: '1' }).eq('key', 'agency_max_age_ms');
    const { data } = await service.from('settings').select('value').eq('key', 'agency_max_age_ms').single();
    expect(data!.value).toBe(3600000);
  });
});
```

```bash
npm pkg set scripts.test:db="vitest run --config tests/db/vitest.config.ts"
cat > tests/db/vitest.config.ts <<'EOF'
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
export default defineConfig(({ mode }) => ({
  test: { environment: 'node', globals: true, include: ['tests/db/**/*.int.test.ts'], env: loadEnv(mode, process.cwd(), '') },
}));
EOF
```

- [ ] **Step 8: Run the integration tests**

Run: `npm run test:db`
Expected: all tests pass. If a test fails, fix the SQL (re-run `supabase db reset`), not the test. Note that the rate-limit and blocked-device tests use fresh device UUIDs, so repeated runs are safe.

- [ ] **Step 9: Commit**

```bash
git add supabase tests/db package.json && git commit -m "feat(db): schema, RLS, submit_report/confirm/moderate RPCs with integration tests"
```

---

### Task 7: Agency poller (BMA, ThaiWater, TMD CAP, Longdo)

**Files:**
- Create: `poller/src/types.ts`, `poller/src/config.ts`, `poller/src/parse/{bma,thaiwater,tmd,longdo}.ts`, `poller/src/fetch.ts`, `poller/src/store.ts`, `poller/src/cleanup.ts`, `poller/src/run.ts`
- Test: `poller/src/parse/{bma,thaiwater,tmd,longdo}.test.ts`, `poller/src/cleanup.test.ts`

**Interfaces:**
- Consumes: `haversineM` from `src/core/geo.ts`; `VILLAGE_CENTER`, `WARNING_MAX_AGE_MS`, `MEDIA_RETENTION_DAYS` from `src/core/config.ts`; DB tables `agency_readings`, `agency_warnings`, `incidents`, `reports`, bucket `evidence`.
- Produces: `Reading { source: 'bma_canal' | 'bma_rain' | 'thaiwater'; stationId: string; stationName: string; lat: number | null; lng: number | null; metric: string; value: number; unit: string; observedAt: Date }`; `Warning { id: string; title: string; body: string; url: string; issuedAt: Date; mentionsBangkok: boolean }`; `Incident { id: string; title: string; lat: number; lng: number; severity: number; startAt: Date; stopAt: Date }`; parsers `parseBmaCanal(json: unknown): Reading[]`, `parseBmaRain(json: unknown): Reading[]`, `parseThaiWater(json: unknown): Reading[]`, `parseTmdCap(xml: string, now: Date): Warning[]`, `parseLongdo(json: unknown, now: Date): Incident[]`, `parseDotNetDate(s: string | null | undefined): Date | null`, `selectExpiredMedia(rows, now, days)`; CLI `npm run poll`.
- Real response shapes (verified 2026-10-04; fixtures below are trimmed copies of them): BMA canal = `{ waterStation: [{ water_station_info: { water_code, water_shortname, latitude, longitude, water_level_last: { wl_in, wl_out01, site_timestamp: "/Date(ms)/" } } }] }` (unit unconfirmed; `site_timestamp` year-1 value `/Date(-62135596800000)/` means "none"); BMA rain = `[{ rain_code, rain_shortname, latitude, longitude, site_timestamp, rf1hr, rf24hr }]`; ThaiWater = `{ waterlevel_data: { data: [{ waterlevel_datetime: "YYYY-MM-DD HH:mm", waterlevel_msl: "0.64", station: { id, tele_station_name: { th }, tele_station_lat, tele_station_long } }] } }`; Longdo = `[{ eid, title, latitude: "13.7", longitude: "100.7", type: "6", start: "YYYY-MM-DD HH:mm:ss", stop, severity }]`; TMD CAP RSS `<item><title/><link/><description/><guid/><pubDate/></item>`. All local times are Thailand (+07:00).

- [ ] **Step 1: Types and watch-list config**

```ts
// poller/src/types.ts
export interface Reading {
  source: 'bma_canal' | 'bma_rain' | 'thaiwater'; stationId: string; stationName: string;
  lat: number | null; lng: number | null; metric: string; value: number; unit: string; observedAt: Date;
}
export interface Warning { id: string; title: string; body: string; url: string; issuedAt: Date; mentionsBangkok: boolean }
export interface Incident { id: string; title: string; lat: number; lng: number; severity: number; startAt: Date; stopAt: Date }
```

```ts
// poller/src/config.ts
export const WATCH = {
  canal: ['WL.STN.02', 'WL.STN.01', 'WL.STN.03', 'WL.LBK.02', 'WL.KSM.01', 'WL.PWT.04', 'WL.LPT.03'],
  rain: ['RF.MBR.03', 'RF.LKB.02', 'RF.SPS.01', 'RF.MBR.01'],
  thaiwaterNameIncludes: ['คลองลำปลาทิว'],
} as const;
export const LONGDO_RADIUS_M = 10_000;
export const LONGDO_FLOOD_TYPE = '6';
export const BMA_BASE = 'https://weather.bangkok.go.th';
```

- [ ] **Step 2: Write failing parser tests**

```ts
// poller/src/parse/bma.test.ts
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
```

```ts
// poller/src/parse/thaiwater.test.ts
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
```

```ts
// poller/src/parse/tmd.test.ts
import { parseTmdCap } from './tmd';

const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>ฝนตกหนัก</title><link>https://www.tmd.go.th/uploads/CAP/CAPTMD20261003165356_2.xml</link>
<description>ประเทศไทยตอนบนมีฝนตกหนัก ส่งผลกระทบกับภาคกลาง รวมทั้งกรุงเทพมหานครและปริมณฑล</description>
<guid isPermaLink="false">TMD20261003165356_2</guid><pubDate>Sat, 03 Oct 2026 22:50:00 +0700</pubDate></item>
<item><title>เตือนเก่า</title><link>https://x/old.xml</link><description>เก่า</description>
<guid isPermaLink="false">TMD-OLD</guid><pubDate>Sat, 26 Sep 2026 10:00:00 +0700</pubDate></item>
</channel></rss>`;

const NOW = new Date('2026-10-04T10:00:00Z');
it('parses items, flags Bangkok mentions, and drops items older than 48 hours', () => {
  const out = parseTmdCap(xml, NOW);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ id: 'TMD20261003165356_2', title: 'ฝนตกหนัก', mentionsBangkok: true });
  expect(out[0]!.issuedAt.toISOString()).toBe('2026-10-03T15:50:00.000Z');
});
it('handles a feed with a single item and with none', () => {
  expect(parseTmdCap('<rss><channel></channel></rss>', NOW)).toEqual([]);
  expect(parseTmdCap(xml.replace(/<item>[\s\S]*?<\/item>(?=\s*<item>)/, ''), NOW)).toEqual([]);
});
```

```ts
// poller/src/parse/longdo.test.ts
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
```

```ts
// poller/src/cleanup.test.ts
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
```

Run: `npx vitest run poller` → Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the parsers and cleanup selection**

```ts
// poller/src/parse/bma.ts
import { WATCH } from '../config';
import type { Reading } from '../types';

export function parseDotNetDate(s: string | null | undefined): Date | null {
  const m = typeof s === 'string' ? /\/Date\((-?\d+)\)\//.exec(s) : null;
  if (!m) return null;
  const ms = Number(m[1]);
  if (ms < 0) return null; // .NET year-1 sentinel = "no reading"
  return new Date(ms);
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseBmaCanal(json: unknown): Reading[] {
  const stations = (json as { waterStation?: unknown[] } | null)?.waterStation;
  if (!Array.isArray(stations)) return [];
  const out: Reading[] = [];
  for (const s of stations as Array<{ water_station_info?: Record<string, any> }>) {
    const info = s?.water_station_info;
    const code = info?.water_code as string | undefined;
    if (!info || !code || !(WATCH.canal as readonly string[]).includes(code)) continue;
    const last = info.water_level_last ?? {};
    const observedAt = parseDotNetDate(last.site_timestamp);
    if (!observedAt) continue;
    for (const metric of ['wl_in', 'wl_out01'] as const) {
      const value = num(last[metric]);
      if (value === null) continue;
      out.push({
        source: 'bma_canal', stationId: code, stationName: String(info.water_shortname ?? code),
        lat: num(info.latitude), lng: num(info.longitude), metric, value, unit: 'm', observedAt,
      });
    }
  }
  return out;
}

export function parseBmaRain(json: unknown): Reading[] {
  if (!Array.isArray(json)) return [];
  const out: Reading[] = [];
  for (const s of json as Array<Record<string, any>>) {
    const code = s?.rain_code as string | undefined;
    if (!code || !(WATCH.rain as readonly string[]).includes(code)) continue;
    const observedAt = parseDotNetDate(s.site_timestamp);
    if (!observedAt) continue;
    for (const metric of ['rf1hr', 'rf24hr'] as const) {
      const value = num(s[metric]);
      if (value === null) continue;
      out.push({
        source: 'bma_rain', stationId: code, stationName: String(s.rain_shortname ?? code),
        lat: num(s.latitude), lng: num(s.longitude), metric, value, unit: 'mm', observedAt,
      });
    }
  }
  return out;
}
```

```ts
// poller/src/parse/thaiwater.ts
import { WATCH } from '../config';
import type { Reading } from '../types';

export function parseThaiWater(json: unknown): Reading[] {
  const data = (json as { waterlevel_data?: { data?: unknown[] } } | null)?.waterlevel_data?.data;
  if (!Array.isArray(data)) return [];
  const out: Reading[] = [];
  for (const r of data as Array<Record<string, any>>) {
    const name = r?.station?.tele_station_name?.th as string | undefined;
    if (!name || !WATCH.thaiwaterNameIncludes.some((n) => name.includes(n))) continue;
    const value = r.waterlevel_msl == null ? NaN : Number(r.waterlevel_msl);
    if (!Number.isFinite(value) || typeof r.waterlevel_datetime !== 'string') continue;
    const observedAt = new Date(`${r.waterlevel_datetime.replace(' ', 'T')}:00+07:00`);
    if (Number.isNaN(observedAt.getTime())) continue;
    out.push({
      source: 'thaiwater', stationId: String(r.station.id), stationName: name,
      lat: r.station.tele_station_lat ?? null, lng: r.station.tele_station_long ?? null,
      metric: 'waterlevel_msl', value, unit: 'm MSL', observedAt,
    });
  }
  return out;
}
```

```ts
// poller/src/parse/tmd.ts
import { XMLParser } from 'fast-xml-parser';
import { WARNING_MAX_AGE_MS } from '../../../src/core/config';
import type { Warning } from '../types';

export function parseTmdCap(xml: string, now: Date): Warning[] {
  const doc = new XMLParser({ ignoreAttributes: true, trimValues: true }).parse(xml);
  const raw = doc?.rss?.channel?.item;
  const items: Array<Record<string, any>> = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: Warning[] = [];
  for (const it of items) {
    const issuedAt = new Date(String(it.pubDate));
    if (Number.isNaN(issuedAt.getTime()) || now.getTime() - issuedAt.getTime() > WARNING_MAX_AGE_MS) continue;
    const body = String(it.description ?? '');
    out.push({
      id: String(it.guid?.['#text'] ?? it.guid ?? it.link), title: String(it.title ?? ''), body, url: String(it.link ?? ''),
      issuedAt, mentionsBangkok: /กรุงเทพ/.test(body) || /กรุงเทพ/.test(String(it.title ?? '')),
    });
  }
  return out;
}
```

```ts
// poller/src/parse/longdo.ts
import { VILLAGE_CENTER } from '../../../src/core/config';
import { haversineM } from '../../../src/core/geo';
import { LONGDO_FLOOD_TYPE, LONGDO_RADIUS_M } from '../config';
import type { Incident } from '../types';

const thai = (s: unknown): Date | null => {
  if (typeof s !== 'string') return null;
  const d = new Date(`${s.replace(' ', 'T')}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function parseLongdo(json: unknown, now: Date): Incident[] {
  if (!Array.isArray(json)) return [];
  const out: Incident[] = [];
  for (const e of json as Array<Record<string, any>>) {
    if (String(e?.type) !== LONGDO_FLOOD_TYPE) continue;
    const lat = Number(e.latitude);
    const lng = Number(e.longitude);
    const startAt = thai(e.start);
    const stopAt = thai(e.stop);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !startAt || !stopAt) continue;
    if (stopAt.getTime() <= now.getTime()) continue;
    if (haversineM(VILLAGE_CENTER, { lat, lng }) > LONGDO_RADIUS_M) continue;
    out.push({ id: String(e.eid), title: String(e.title ?? ''), lat, lng, severity: Number(e.severity ?? 0), startAt, stopAt });
  }
  return out;
}
```

```ts
// poller/src/cleanup.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MediaRow { id: string; media_path: string | null; created_at: string }

export function selectExpiredMedia<T extends MediaRow>(rows: T[], now: Date, days: number): T[] {
  const cutoff = now.getTime() - days * 24 * 3_600_000;
  return rows.filter((r) => r.media_path && Date.parse(r.created_at) < cutoff);
}

export async function deleteExpiredMedia(db: SupabaseClient, now: Date, days: number): Promise<number> {
  const { data, error } = await db.from('reports').select('id, media_path, created_at').not('media_path', 'is', null)
    .lt('created_at', new Date(now.getTime() - days * 24 * 3_600_000).toISOString()).limit(500);
  if (error) throw error;
  const expired = selectExpiredMedia((data ?? []) as MediaRow[], now, days);
  if (!expired.length) return 0;
  const { error: rmErr } = await db.storage.from('evidence').remove(expired.map((r) => r.media_path!));
  if (rmErr) throw rmErr;
  const { error: upErr } = await db.from('reports').update({ media_path: null, media_type: null }).in('id', expired.map((r) => r.id));
  if (upErr) throw upErr;
  return expired.length;
}
```

- [ ] **Step 4: Run parser tests**

Run: `npx vitest run poller` → Expected: all pass. If the TMD test fails on `guid` shape, print `parse(xml)` to see how fast-xml-parser represents `<guid isPermaLink="false">…</guid>` with attributes ignored (it yields a plain string) and adjust the accessor; do not loosen the assertions.

- [ ] **Step 5: Implement fetching, storing, and the runner**

```ts
// poller/src/fetch.ts
import https from 'node:https';
import { BMA_BASE } from './config';

const UA = { 'user-agent': 'village-flood-portal/1.0 (community project)' };

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

export const fetchBmaCanal = () => json(`${BMA_BASE}/Klongmap/GetDataForUpdate`);
export const fetchBmaRain = () => json(`${BMA_BASE}/rain/PageMap/GetDataForUpdate`, { method: 'POST', body: '' });
export const fetchThaiWater = () => json('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
export const fetchLongdo = () => json('https://event.longdo.com/feed/json');

/** TMD's TLS chain is incomplete (verified 2026-10-04). Public-domain feed, GET only, so verification is skipped for this host alone. */
export function fetchTmdCap(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get('https://www.tmd.go.th/api/xml/CAP', { rejectUnauthorized: false, headers: UA, timeout: 30_000 }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`TMD CAP → HTTP ${res.statusCode}`)); res.resume(); return; }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('TMD CAP timeout')));
  });
}
```

```ts
// poller/src/store.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Incident, Reading, Warning } from './types';

export async function storeReadings(db: SupabaseClient, rows: Reading[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from('agency_readings').upsert(
    rows.map((r) => ({
      source: r.source, station_id: r.stationId, station_name: r.stationName, lat: r.lat, lng: r.lng,
      metric: r.metric, value: r.value, unit: r.unit, observed_at: r.observedAt.toISOString(),
    })),
    { onConflict: 'source,station_id,metric,observed_at', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function storeWarnings(db: SupabaseClient, rows: Warning[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from('agency_warnings').upsert(
    rows.map((w) => ({ id: w.id, source: 'tmd', title: w.title, body: w.body, url: w.url, issued_at: w.issuedAt.toISOString(), mentions_bangkok: w.mentionsBangkok })),
    { onConflict: 'id' },
  );
  if (error) throw error;
}

export async function storeIncidents(db: SupabaseClient, rows: Incident[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from('incidents').upsert(
    rows.map((i) => ({ id: `longdo-${i.id}`, source: 'longdo', title: i.title, lat: i.lat, lng: i.lng, severity: i.severity, start_at: i.startAt.toISOString(), stop_at: i.stopAt.toISOString() })),
    { onConflict: 'id' },
  );
  if (error) throw error;
}
```

```ts
// poller/src/run.ts — run once; schedule externally (cron) every 10 minutes.
import { createClient } from '@supabase/supabase-js';
import { MEDIA_RETENTION_DAYS } from '../../src/core/config';
import { deleteExpiredMedia } from './cleanup';
import { fetchBmaCanal, fetchBmaRain, fetchLongdo, fetchThaiWater, fetchTmdCap } from './fetch';
import { parseBmaCanal, parseBmaRain } from './parse/bma';
import { parseLongdo } from './parse/longdo';
import { parseThaiWater } from './parse/thaiwater';
import { parseTmdCap } from './parse/tmd';
import { storeIncidents, storeReadings, storeWarnings } from './store';

export async function runOnce(now = new Date()): Promise<void> {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  // Each source is independent: one failing source must not stop the others, and failures are logged, not hidden.
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ['bma_canal', async () => storeReadings(db, parseBmaCanal(await fetchBmaCanal()))],
    ['bma_rain', async () => storeReadings(db, parseBmaRain(await fetchBmaRain()))],
    ['thaiwater', async () => storeReadings(db, parseThaiWater(await fetchThaiWater()))],
    ['tmd_cap', async () => storeWarnings(db, parseTmdCap(await fetchTmdCap(), now))],
    ['longdo', async () => storeIncidents(db, parseLongdo(await fetchLongdo(), now))],
    ['media_cleanup', async () => console.log(`media removed: ${await deleteExpiredMedia(db, now, MEDIA_RETENTION_DAYS)}`)],
  ];
  const results = await Promise.allSettled(jobs.map(([, fn]) => fn()));
  results.forEach((r, i) => console.log(`${now.toISOString()} ${jobs[i]![0]}: ${r.status === 'fulfilled' ? 'ok' : `FAILED ${(r.reason as Error).message}`}`));
  if (results.every((r) => r.status === 'rejected')) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await runOnce();
```

- [ ] **Step 6: Run the poller against the local/dev database**

Run: `npm run poll`
Expected: five `ok` lines for `bma_canal`, `bma_rain`, `thaiwater`, `tmd_cap`, `longdo` plus `media_cleanup: ok`. Then verify rows:

Run: `supabase db query "select source, station_id, metric, value, observed_at from agency_latest where station_id = 'WL.STN.02'"`
Expected: a `wl_in` row with a value and a recent `observed_at`. If a source prints FAILED, record the error in the spike doc; a failed source is acceptable (the UI shows "ไม่มีข้อมูลล่าสุด") but a parser returning zero rows from a 200 response is a bug — diff the live JSON against the fixture shape above.

- [ ] **Step 7: Schedule according to the Task 1 `POLLER_HOST` decision and commit**

If `thai-vps` or `home-machine`: install Node 20+, clone the repo, create `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and add (`crontab -e`):

```
*/10 * * * * cd /path/to/village-flood-app && /usr/bin/env npm run poll >> /var/log/flood-poller.log 2>&1
```

If `vercel`: add `api/poll.ts` that calls `runOnce()` guarded by a `CRON_SECRET` header, and a `vercel.json` cron `{ "path": "/api/poll", "schedule": "*/10 * * * *" }` (Hobby cron limits apply — check Task 1 quota notes; otherwise use GitHub Actions with `schedule: '*/10 * * * *'`).

```bash
git add poller package.json && git commit -m "feat(poller): BMA/ThaiWater/TMD/Longdo parsers, storage, media cleanup, runner"
```

---

### Task 8: Data layer, snapshot state, shell, and the age/status components

**Files:**
- Create: `src/vite-env.d.ts`, `src/data/{types,mappers,supabase,device,queries}.ts`, `src/state/SnapshotContext.tsx`, `src/ui/{App.tsx,Layout.tsx,styles.css}`, `src/ui/components/{AgeLabel,StatusBadge,Disclaimer,OfflineBanner}.tsx`
- Modify: `src/main.tsx`
- Test: `src/data/mappers.test.ts`, `src/data/device.test.ts`, `src/ui/components/AgeLabel.test.tsx`, `src/ui/components/StatusBadge.test.tsx`

**Interfaces:**
- Consumes: `Report`, `ReportKind`, `LatLng` (types.ts); `TTL_MS`, `AGENCY_MAX_AGE_MS`, `VILLAGE_CENTER`, `DISCLAIMER_TH` (config.ts); `formatAgeTh`; `STATUS_LABEL_TH`, `STATUS_COLOR`; `RouteDef` (routes.ts); views/tables from Task 6.
- Produces (`data/types.ts`): `SegmentRow { id; name; geojson: LineString }`, `MarkRow { id; name; geojson: Point; levels: { level: number; label: string }[] }`, `PlaceRow { id; name; category: 'food'|'market'|'store'|'fuel'|'hospital'; geojson: Point }`, `DestinationRow { id; name; kind; lat; lng }`, `AppSettings { ttlMs: { road; water_level; supply }; agencyMaxAgeMs: number; gaugeThresholds: Record<string, { watch: number; danger: number }>; origin: LatLng }`, `FeedItem { id; kind: ReportKind; targetId; value; nickname; createdAt: number; mediaUrl: string | null; mediaType: string | null; note: string | null; byCommittee; confirmedByCommittee; confirmations: number; locationOk: boolean }`, `AgencyReading { source; stationId; stationName; lat: number | null; lng: number | null; metric; value; unit; observedAt: number }`, `WarningRow { id; title; body; url; issuedAt: number; mentionsBangkok }`, `IncidentRow { id; title; lat; lng; severity; startAt: number; stopAt: number }`, `Snapshot { segments; marks; places; destinations; routes: RouteDef[]; settings: AppSettings; reports: Report[]; feed: FeedItem[]; latest: AgencyReading[]; recent: AgencyReading[]; warnings: WarningRow[]; incidents: IncidentRow[]; serverOffsetMs: number; fetchedAt: number }`
- Produces (`mappers.ts`): `mapReportRow(row, mediaUrlFn): { report: Report; feed: FeedItem }`, `parseSettings(rows: { key: string; value: unknown }[]): AppSettings`, `mapReading(row): AgencyReading`
- Produces: `getDeviceId(): string`, `getNickname(): string`, `setNickname(n: string): void`; `fetchSnapshot(): Promise<Snapshot>`; `useData(): { snapshot: Snapshot | null; error: Error | null; loading: boolean; reload(): void; now: number }`; components `<AgeLabel at: number | null, now: number, maxAgeMs?: number />`, `<StatusBadge state: SegmentState, conflict?: boolean />`, `<Disclaimer />`, `<OfflineBanner />`

- [ ] **Step 1: Install geojson types and add env typing**

```bash
npm install -D @types/geojson
printf '/// <reference types="vite/client" />\n' > src/vite-env.d.ts
```

- [ ] **Step 2: Write data types**

```ts
// src/data/types.ts
import type { LineString, Point } from 'geojson';
import type { LatLng, Report, ReportKind } from '../core/types';
import type { RouteDef } from '../core/routes';

export interface SegmentRow { id: string; name: string; geojson: LineString }
export interface MarkRow { id: string; name: string; geojson: Point; levels: { level: number; label: string }[] }
export type PlaceCategory = 'food' | 'market' | 'store' | 'fuel' | 'hospital';
export interface PlaceRow { id: string; name: string; category: PlaceCategory; geojson: Point }
export interface DestinationRow { id: string; name: string; kind: string; lat: number; lng: number }
export interface AppSettings {
  ttlMs: { road: number; water_level: number; supply: number };
  agencyMaxAgeMs: number;
  gaugeThresholds: Record<string, { watch: number; danger: number }>;
  origin: LatLng;
}
export interface FeedItem {
  id: string; kind: ReportKind; targetId: string; value: string; nickname: string; createdAt: number;
  mediaUrl: string | null; mediaType: string | null; note: string | null;
  byCommittee: boolean; confirmedByCommittee: boolean; confirmations: number; locationOk: boolean;
}
export interface AgencyReading {
  source: string; stationId: string; stationName: string; lat: number | null; lng: number | null;
  metric: string; value: number; unit: string; observedAt: number;
}
export interface WarningRow { id: string; title: string; body: string; url: string; issuedAt: number; mentionsBangkok: boolean }
export interface IncidentRow { id: string; title: string; lat: number; lng: number; severity: number; startAt: number; stopAt: number }

export interface Snapshot {
  segments: SegmentRow[]; marks: MarkRow[]; places: PlaceRow[]; destinations: DestinationRow[]; routes: RouteDef[];
  settings: AppSettings; reports: Report[]; feed: FeedItem[];
  latest: AgencyReading[]; recent: AgencyReading[]; warnings: WarningRow[]; incidents: IncidentRow[];
  serverOffsetMs: number; fetchedAt: number;
}
```

- [ ] **Step 3: Write failing mapper and device tests**

```ts
// src/data/mappers.test.ts
import { mapReportRow, parseSettings, mapReading } from './mappers';
import { TTL_MS, AGENCY_MAX_AGE_MS, VILLAGE_CENTER } from '../core/config';

const row = {
  id: 'r1', kind: 'road', target_id: 'seg1', value: 'small_car', nickname: 'สมชาย', created_at: '2026-10-04T07:00:00Z',
  location_ok: true, media_path: 'dev/a.jpg', media_type: 'image/jpeg', note: null, by_committee: false,
  confirmed_by_committee: false, confirmations: '2', lat: 1, lng: 2,
};

describe('mapReportRow', () => {
  const { report, feed } = mapReportRow(row, (p) => `https://m/${p}`);
  it('derives hasEvidence from media_path and parses time', () => {
    expect(report).toMatchObject({ id: 'r1', kind: 'road', targetId: 'seg1', hasEvidence: true, locationOk: true, createdAt: Date.parse('2026-10-04T07:00:00Z') });
  });
  it('builds the feed item with media url and numeric confirmations', () => {
    expect(feed).toMatchObject({ mediaUrl: 'https://m/dev/a.jpg', confirmations: 2, nickname: 'สมชาย' });
  });
  it('has no evidence when media was removed', () => {
    expect(mapReportRow({ ...row, media_path: null }, (p) => p).report.hasEvidence).toBe(false);
  });
});

describe('parseSettings', () => {
  it('falls back to defaults when keys are missing', () => {
    expect(parseSettings([])).toEqual({ ttlMs: { ...TTL_MS }, agencyMaxAgeMs: AGENCY_MAX_AGE_MS, gaugeThresholds: {}, origin: { ...VILLAGE_CENTER } });
  });
  it('reads committee overrides', () => {
    const s = parseSettings([
      { key: 'ttl_ms', value: { road: 1000, water_level: 2000, supply: 3000 } },
      { key: 'agency_max_age_ms', value: 5000 },
      { key: 'gauge_thresholds', value: { 'WL.STN.02': { watch: 0.5, danger: 0.8 } } },
      { key: 'origin', value: { lat: 13.1, lng: 100.2 } },
    ]);
    expect(s.ttlMs).toEqual({ road: 1000, water_level: 2000, supply: 3000 });
    expect(s.gaugeThresholds['WL.STN.02']).toEqual({ watch: 0.5, danger: 0.8 });
    expect(s.origin).toEqual({ lat: 13.1, lng: 100.2 });
  });
  it('drops invalid thresholds and non-positive TTLs', () => {
    const s = parseSettings([
      { key: 'ttl_ms', value: { road: -1, water_level: 'x', supply: 3000 } },
      { key: 'gauge_thresholds', value: { A: { watch: 0.9, danger: 0.5 }, B: { watch: 'a' }, C: null } },
    ]);
    expect(s.ttlMs).toEqual({ road: TTL_MS.road, water_level: TTL_MS.water_level, supply: 3000 });
    expect(s.gaugeThresholds).toEqual({});
  });
});

it('maps agency readings', () => {
  expect(mapReading({ source: 'bma_canal', station_id: 'WL.STN.02', station_name: 'x', lat: 1, lng: 2, metric: 'wl_in', value: 0.7, unit: 'm', observed_at: '2026-10-04T07:00:00Z' }))
    .toMatchObject({ stationId: 'WL.STN.02', observedAt: Date.parse('2026-10-04T07:00:00Z'), value: 0.7 });
});
```

```ts
// src/data/device.test.ts
import { getDeviceId, getNickname, setNickname } from './device';

beforeEach(() => localStorage.clear());
it('creates a device id once and keeps it', () => {
  const a = getDeviceId();
  expect(a).toMatch(/^[0-9a-f-]{36}$/);
  expect(getDeviceId()).toBe(a);
});
it('stores the nickname', () => {
  expect(getNickname()).toBe('');
  setNickname('  สมศรี ');
  expect(getNickname()).toBe('สมศรี');
});
```

Run: `npx vitest run src/data` → Expected: FAIL.

- [ ] **Step 4: Implement mappers and device**

```ts
// src/data/mappers.ts
import { AGENCY_MAX_AGE_MS, TTL_MS, VILLAGE_CENTER } from '../core/config';
import type { Report, ReportKind } from '../core/types';
import type { AgencyReading, AppSettings, FeedItem } from './types';

export interface ReportRow {
  id: string; kind: string; target_id: string; value: string; nickname: string; created_at: string;
  location_ok: boolean; media_path: string | null; media_type: string | null; note: string | null;
  by_committee: boolean; confirmed_by_committee: boolean; confirmations: number | string;
}

export function mapReportRow(row: ReportRow, mediaUrlFn: (path: string) => string): { report: Report; feed: FeedItem } {
  const createdAt = Date.parse(row.created_at);
  const kind = row.kind as ReportKind;
  return {
    report: {
      id: row.id, kind, targetId: row.target_id, value: row.value, createdAt,
      hasEvidence: !!row.media_path, locationOk: row.location_ok,
      byCommittee: row.by_committee, confirmedByCommittee: row.confirmed_by_committee,
    },
    feed: {
      id: row.id, kind, targetId: row.target_id, value: row.value, nickname: row.nickname, createdAt,
      mediaUrl: row.media_path ? mediaUrlFn(row.media_path) : null, mediaType: row.media_type, note: row.note,
      byCommittee: row.by_committee, confirmedByCommittee: row.confirmed_by_committee,
      confirmations: Number(row.confirmations ?? 0), locationOk: row.location_ok,
    },
  };
}

const posNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function parseSettings(rows: { key: string; value: unknown }[]): AppSettings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value as any;
  const ttl = get('ttl_ms') ?? {};
  const thresholdsRaw = get('gauge_thresholds') ?? {};
  const gaugeThresholds: AppSettings['gaugeThresholds'] = {};
  for (const [station, t] of Object.entries(thresholdsRaw as Record<string, any>)) {
    if (t && typeof t.watch === 'number' && typeof t.danger === 'number' && t.watch < t.danger) {
      gaugeThresholds[station] = { watch: t.watch, danger: t.danger };
    }
  }
  const o = get('origin');
  const validOrigin = o && typeof o.lat === 'number' && typeof o.lng === 'number';
  return {
    ttlMs: {
      road: posNum(ttl.road) ?? TTL_MS.road,
      water_level: posNum(ttl.water_level) ?? TTL_MS.water_level,
      supply: posNum(ttl.supply) ?? TTL_MS.supply,
    },
    agencyMaxAgeMs: posNum(get('agency_max_age_ms')) ?? AGENCY_MAX_AGE_MS,
    gaugeThresholds,
    origin: validOrigin ? { lat: o.lat, lng: o.lng } : { ...VILLAGE_CENTER },
  };
}

export function mapReading(r: Record<string, any>): AgencyReading {
  return {
    source: r.source, stationId: r.station_id, stationName: r.station_name, lat: r.lat, lng: r.lng,
    metric: r.metric, value: Number(r.value), unit: r.unit, observedAt: Date.parse(r.observed_at),
  };
}
```

```ts
// src/data/device.ts
const ID_KEY = 'flood.device';
const NAME_KEY = 'flood.nickname';
let memoryId: string | null = null; // fallback when localStorage is blocked

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(ID_KEY, id); }
    return id;
  } catch {
    return (memoryId ??= crypto.randomUUID());
  }
}
export function getNickname(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
export function setNickname(n: string): void {
  try { localStorage.setItem(NAME_KEY, n.trim()); } catch { /* ignore */ }
}
```

Run: `npx vitest run src/data` → Expected: PASS.

- [ ] **Step 5: Implement Supabase client, queries, and snapshot context**

```ts
// src/data/supabase.ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const supabase = createClient(url, key);
export const mediaUrl = (path: string) => `${url}/storage/v1/object/public/evidence/${path}`;
```

```ts
// src/data/queries.ts
import type { RouteDef } from '../core/routes';
import { mapReading, mapReportRow, parseSettings, type ReportRow } from './mappers';
import { mediaUrl, supabase } from './supabase';
import type { DestinationRow, IncidentRow, MarkRow, PlaceRow, SegmentRow, Snapshot, WarningRow } from './types';

async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const [segments, marks, places, destinations, routes, settings, reports, latest, recent, warnings, incidents, serverTime] =
    await Promise.all([
      q<SegmentRow[]>(supabase.from('segments').select('id,name,geojson').order('sort')),
      q<MarkRow[]>(supabase.from('water_marks').select('id,name,geojson,levels')),
      q<PlaceRow[]>(supabase.from('places').select('id,name,category,geojson')),
      q<DestinationRow[]>(supabase.from('destinations').select('id,name,kind,lat,lng')),
      q<any[]>(supabase.from('routes').select('id,name,destination_id,segment_ids,waypoints,distance_m')),
      q<{ key: string; value: unknown }[]>(supabase.from('settings').select('key,value')),
      q<ReportRow[]>(supabase.from('reports_public').select('*').order('created_at', { ascending: false }).limit(500)),
      q<any[]>(supabase.from('agency_latest').select('*')),
      q<any[]>(supabase.from('agency_recent').select('*')),
      q<any[]>(supabase.from('agency_warnings').select('*').order('issued_at', { ascending: false }).limit(20)),
      q<any[]>(supabase.from('incidents').select('*').gt('stop_at', new Date().toISOString())),
      q<string>(supabase.rpc('server_time')),
    ]);

  const mapped = reports.map((r) => mapReportRow(r, mediaUrl));
  return {
    segments, marks, places, destinations,
    routes: routes.map((r): RouteDef => ({ id: r.id, name: r.name, destinationId: r.destination_id, segmentIds: r.segment_ids, waypoints: r.waypoints ?? [], distanceM: r.distance_m })),
    settings: parseSettings(settings),
    reports: mapped.map((m) => m.report), feed: mapped.map((m) => m.feed),
    latest: latest.map(mapReading), recent: recent.map(mapReading),
    warnings: warnings.map((w): WarningRow => ({ id: w.id, title: w.title, body: w.body, url: w.url, issuedAt: Date.parse(w.issued_at), mentionsBangkok: w.mentions_bangkok })),
    incidents: incidents.map((i): IncidentRow => ({ id: i.id, title: i.title, lat: i.lat, lng: i.lng, severity: i.severity ?? 0, startAt: Date.parse(i.start_at), stopAt: Date.parse(i.stop_at) })),
    serverOffsetMs: Date.parse(serverTime) - Date.now(),
    fetchedAt: Date.now(),
  };
}
```

```tsx
// src/state/SnapshotContext.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchSnapshot } from '../data/queries';
import type { Snapshot } from '../data/types';

const CACHE_KEY = 'flood.snapshot.v1';
const readCache = (): Snapshot | null => { try { const s = localStorage.getItem(CACHE_KEY); return s ? (JSON.parse(s) as Snapshot) : null; } catch { return null; } };
const writeCache = (s: Snapshot) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* quota or blocked: ignore */ } };

interface Ctx { snapshot: Snapshot | null; error: Error | null; loading: boolean; reload(): void; now: number }
const DataContext = createContext<Ctx | null>(null);

export function SnapshotProvider({ children, refreshMs = 60_000 }: { children: ReactNode; refreshMs?: number }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(readCache);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(Date.now());

  const load = useCallback(async () => {
    try { const s = await fetchSnapshot(); setSnapshot(s); setError(null); writeCache(s); }
    catch (e) { setError(e as Error); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, refreshMs);
    const clock = setInterval(() => setTick(Date.now()), 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') { setTick(Date.now()); load(); } };
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(refresh); clearInterval(clock); window.removeEventListener('online', load); document.removeEventListener('visibilitychange', onVisible); };
  }, [load, refreshMs]);

  // `now` is corrected by the server clock offset so a wrong phone clock cannot make old data look fresh.
  const now = tick + (snapshot?.serverOffsetMs ?? 0);
  const value = useMemo(() => ({ snapshot, error, loading, reload: load, now }), [snapshot, error, loading, load, now]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <SnapshotProvider>');
  return ctx;
}
```

- [ ] **Step 6: Write failing component tests**

```tsx
// src/ui/components/AgeLabel.test.tsx
import { render, screen } from '@testing-library/react';
import { AgeLabel } from './AgeLabel';

const NOW = 1_000_000_000_000;
it('shows the age in Thai', () => {
  render(<AgeLabel at={NOW - 5 * 60_000} now={NOW} />);
  expect(screen.getByText('อัปเดต 5 นาทีที่แล้ว')).toBeInTheDocument();
});
it('marks data older than the limit as old', () => {
  render(<AgeLabel at={NOW - 2 * 3_600_000} now={NOW} maxAgeMs={3_600_000} />);
  expect(screen.getByText(/ข้อมูลเก่า/)).toBeInTheDocument();
});
it('says there is no data instead of a time when missing', () => {
  render(<AgeLabel at={null} now={NOW} />);
  expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument();
});
```

```tsx
// src/ui/components/StatusBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

it('always shows a Thai text label, not just colour', () => {
  render(<StatusBadge state="small_car" />);
  expect(screen.getByText('รถเล็กไปได้')).toBeInTheDocument();
});
it('renders unknown distinctly from dry', () => {
  const { container } = render(<StatusBadge state="unknown" />);
  expect(screen.getByText('ไม่ทราบ')).toBeInTheDocument();
  expect(container.querySelector('.badge--unknown')).not.toBeNull();
  expect(container.querySelector('.badge--dry')).toBeNull();
});
it('shows the conflict note', () => {
  render(<StatusBadge state="impassable" conflict />);
  expect(screen.getByText('มีรายงานขัดแย้ง')).toBeInTheDocument();
});
```

Run: `npx vitest run src/ui` → Expected: FAIL.

- [ ] **Step 7: Implement components, layout, styles, app entry**

```tsx
// src/ui/components/AgeLabel.tsx
import { freshness } from '../../core/agency';
import { formatAgeTh } from '../../core/format';

export function AgeLabel({ at, now, maxAgeMs }: { at: number | null; now: number; maxAgeMs?: number }) {
  if (at === null) return <span className="age age--none">ไม่มีข้อมูล</span>;
  const { ageMs, stale } = freshness(at, now, maxAgeMs ?? Number.POSITIVE_INFINITY);
  return (
    <span className={`age${stale ? ' age--stale' : ''}`}>
      {stale ? 'ข้อมูลเก่า · ' : ''}อัปเดต {formatAgeTh(ageMs)}
    </span>
  );
}
```

```tsx
// src/ui/components/StatusBadge.tsx
import { STATUS_COLOR, STATUS_LABEL_TH } from '../../core/labels';
import type { SegmentState } from '../../core/types';

export function StatusBadge({ state, conflict }: { state: SegmentState; conflict?: boolean }) {
  return (
    <span className="badge-wrap">
      <span className={`badge badge--${state}`} style={{ background: STATUS_COLOR[state] }}>{STATUS_LABEL_TH[state]}</span>
      {conflict && <small className="conflict">มีรายงานขัดแย้ง</small>}
    </span>
  );
}
```

```tsx
// src/ui/components/Disclaimer.tsx
import { DISCLAIMER_TH } from '../../core/config';
export const Disclaimer = () => <p className="disclaimer">{DISCLAIMER_TH}</p>;
```

```tsx
// src/ui/components/OfflineBanner.tsx
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from './AgeLabel';

export function OfflineBanner() {
  const { error, snapshot, now } = useData();
  if (!error) return null;
  return (
    <div className="banner banner--warn" role="status">
      อัปเดตข้อมูลไม่ได้ในขณะนี้ — แสดงข้อมูลที่ได้ครั้งล่าสุด <AgeLabel at={snapshot ? snapshot.fetchedAt + snapshot.serverOffsetMs : null} now={now} />
    </div>
  );
}
```

```tsx
// src/ui/Layout.tsx
import { NavLink, Outlet } from 'react-router-dom';
import { Disclaimer } from './components/Disclaimer';
import { OfflineBanner } from './components/OfflineBanner';

const tabs = [['/', 'หน้าแรก'], ['/map', 'แผนที่'], ['/routes', 'เส้นทาง'], ['/supply', 'เสบียง'], ['/report', 'รายงาน']] as const;

export function Layout() {
  return (
    <div className="app">
      <OfflineBanner />
      <main className="main"><Outlet /></main>
      <Disclaimer />
      <nav className="tabs">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'tab tab--on' : 'tab')}>{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}
```

```tsx
// src/ui/App.tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SnapshotProvider, useData } from '../state/SnapshotContext';
import { Layout } from './Layout';

function Gate({ children }: { children: React.ReactNode }) {
  const { snapshot, loading, error, reload } = useData();
  if (!snapshot && loading) return <p className="page">กำลังโหลดข้อมูล…</p>;
  if (!snapshot) return <div className="page"><p>โหลดข้อมูลไม่ได้ ({error?.message})</p><button onClick={reload}>ลองใหม่</button></div>;
  return <>{children}</>;
}

export function App() {
  return (
    <SnapshotProvider>
      <BrowserRouter>
        <Gate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<div className="page"><h1>พอร์ทัลน้ำท่วมหมู่บ้าน</h1></div>} />
            </Route>
          </Routes>
        </Gate>
      </BrowserRouter>
    </SnapshotProvider>
  );
}
```

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ui/styles.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);
```

```css
/* src/ui/styles.css */
:root { --bg:#f5f7fa; --fg:#14202e; --card:#fff; --line:#d9e0e8; --brand:#0b5cab; --warn:#fff4d6; }
* { box-sizing: border-box; }
body { margin:0; font:16px/1.5 system-ui,"Noto Sans Thai",sans-serif; background:var(--bg); color:var(--fg); }
.app { min-height:100dvh; display:flex; flex-direction:column; padding-bottom:calc(56px + env(safe-area-inset-bottom)); }
.main { flex:1; }
.page { padding:16px; max-width:720px; margin:0 auto; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px; margin:8px 0; }
.tabs { position:fixed; bottom:0; left:0; right:0; display:flex; background:#fff; border-top:1px solid var(--line); padding-bottom:env(safe-area-inset-bottom); }
.tab { flex:1; text-align:center; padding:14px 4px; color:#4a5a6a; text-decoration:none; font-size:14px; }
.tab--on { color:var(--brand); font-weight:700; }
.disclaimer { margin:0; padding:6px 12px; font-size:12px; text-align:center; color:#5a6a7a; }
.banner { padding:8px 12px; font-size:14px; } .banner--warn { background:var(--warn); }
.badge { display:inline-block; padding:2px 10px; border-radius:999px; color:#fff; font-weight:700; font-size:14px; text-shadow:0 0 2px rgba(0,0,0,.45); }
.badge--high_clearance { color:#222; text-shadow:none; }
.badge-wrap { display:inline-flex; flex-direction:column; gap:2px; align-items:flex-start; }
.conflict { color:#b42318; font-weight:600; }
.age { font-size:13px; color:#5a6a7a; } .age--stale { color:#b42318; font-weight:600; } .age--none { color:#8a8f98; }
button, .btn { font:inherit; padding:10px 14px; border-radius:10px; border:1px solid var(--brand); background:var(--brand); color:#fff; min-height:44px; }
button.secondary { background:#fff; color:var(--brand); }
button:disabled { opacity:.5; }
```

- [ ] **Step 8: Run tests, type-check, and view the shell**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

Create `.env` from `.env.example` with the local Supabase URL/anon key, then run `npm run dev` and open the printed URL (use the browser preview). Expected: the heading "พอร์ทัลน้ำท่วมหมู่บ้าน", the tab bar, and the disclaimer line; no console errors. Stop Supabase (`supabase stop`) and reload: the page should still render from the cached snapshot with the yellow "อัปเดตข้อมูลไม่ได้…" banner.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(app): data layer, cached snapshot with server-clock offset, shell, age/status components"
```

---

### Task 9: Evidence capture rules, upload pipeline, and offline outbox

**Files:**
- Create: `src/core/validate.ts`, `src/lib/media.ts`, `src/data/kv.ts`, `src/data/outbox.ts`, `src/data/submit.ts`
- Test: `src/core/validate.test.ts`, `src/lib/media.test.ts`, `src/data/outbox.test.ts`, `src/data/submit.test.ts`

**Interfaces:**
- Consumes: `requiresEvidence`, `ReportKind`, `MAX_VIDEO_BYTES`, `FRESH_CAPTURE_MAX_AGE_MS`, `supabase`.
- Produces (`validate.ts`): `interface DraftInput { kind: ReportKind; targetId: string; value: string; nickname: string; hasEvidence: boolean; note: string }`; `validateDraft(d: DraftInput): string[]` (Thai messages; empty = valid)
- Produces (`media.ts`): `isFreshCapture(file: { lastModified: number }, now: number, maxAgeMs?: number): boolean`; `fitWithin(w: number, h: number, max: number): { w: number; h: number }`; `compressImage(file: File, maxSide?: number, quality?: number): Promise<Blob>`; `readVideoDuration(file: File): Promise<number>`
- Produces (`kv.ts`): `interface KV { get<T>(k: string): Promise<T | undefined>; set(k: string, v: unknown): Promise<void>; del(k: string): Promise<void>; keys(): Promise<string[]> }`; `memoryKV(): KV`; `idbKV(): KV`
- Produces (`submit.ts`): `interface ReportDraft { deviceId: string; nickname: string; kind: ReportKind; targetId: string; value: string; lat: number | null; lng: number | null; note: string | null }`; `interface OutboxItem { id: string; draft: ReportDraft; blob: Blob | null; mediaType: string | null; attempts: number; createdAt: number }`; `class SubmitError extends Error { retryable: boolean }`; `classifySubmitError(message: string): SubmitError`; `describeSubmitError(message: string): string`; `sendItem(item: OutboxItem): Promise<void>`
- Produces (`outbox.ts`): `createOutbox({ store: KV; send(item): Promise<void> })` → `{ add(item), pending(), failed(), dismissFailed(id), flush(): Promise<{ sent: number; failed: number; stoppedOnRetry: boolean }> }`

- [ ] **Step 1: Write failing validation and media tests**

```ts
// src/core/validate.test.ts
import { validateDraft } from './validate';

const ok = { kind: 'road' as const, targetId: 'seg1', value: 'impassable', nickname: 'สมชาย', hasEvidence: false, note: '' };
it('accepts impassable without evidence', () => expect(validateDraft(ok)).toEqual([]));
it('rejects a passable claim without evidence', () => {
  expect(validateDraft({ ...ok, value: 'small_car' })).toContain('ต้องแนบรูปหรือวิดีโอที่ถ่ายใหม่เป็นหลักฐาน');
});
it('rejects water level without evidence', () => {
  expect(validateDraft({ ...ok, kind: 'water_level', value: '2' })).toContain('ต้องแนบรูปหรือวิดีโอที่ถ่ายใหม่เป็นหลักฐาน');
});
it('accepts evidenced passable claim', () => expect(validateDraft({ ...ok, value: 'dry', hasEvidence: true })).toEqual([]));
it('requires nickname, target and value', () => {
  const errs = validateDraft({ ...ok, nickname: ' ', targetId: '', value: '' });
  expect(errs).toEqual(expect.arrayContaining(['กรุณาใส่ชื่อเล่น', 'กรุณาเลือกจุดที่รายงาน', 'กรุณาเลือกสถานะ']));
});
it('requires text for general notes', () => {
  expect(validateDraft({ ...ok, kind: 'general', targetId: 'village', value: 'note', note: '' })).toContain('กรุณาพิมพ์ข้อความ');
});
```

```ts
// src/lib/media.test.ts
import { isFreshCapture, fitWithin } from './media';

const NOW = 1_000_000_000_000;
describe('isFreshCapture', () => {
  it('accepts a file captured moments ago', () => expect(isFreshCapture({ lastModified: NOW - 20_000 }, NOW)).toBe(true));
  it('rejects a gallery file from yesterday', () => expect(isFreshCapture({ lastModified: NOW - 86_400_000 }, NOW)).toBe(false));
  it('rejects a file dated in the future by more than a minute', () => expect(isFreshCapture({ lastModified: NOW + 120_000 }, NOW)).toBe(false));
});
describe('fitWithin', () => {
  it('keeps small images', () => expect(fitWithin(800, 600, 1280)).toEqual({ w: 800, h: 600 }));
  it('scales landscape by the long side', () => expect(fitWithin(4000, 3000, 1280)).toEqual({ w: 1280, h: 960 }));
  it('scales portrait by the long side', () => expect(fitWithin(3000, 4000, 1280)).toEqual({ w: 960, h: 1280 }));
});
```

Run: `npx vitest run src/core/validate.test.ts src/lib` → Expected: FAIL.

- [ ] **Step 2: Implement validation and media helpers**

```ts
// src/core/validate.ts
import { requiresEvidence } from './evidence';
import type { ReportKind } from './types';

export interface DraftInput { kind: ReportKind; targetId: string; value: string; nickname: string; hasEvidence: boolean; note: string }

export function validateDraft(d: DraftInput): string[] {
  const errs: string[] = [];
  if (!d.nickname.trim()) errs.push('กรุณาใส่ชื่อเล่น');
  if (!d.targetId) errs.push('กรุณาเลือกจุดที่รายงาน');
  if (!d.value) errs.push('กรุณาเลือกสถานะ');
  if (d.kind === 'general' && !d.note.trim()) errs.push('กรุณาพิมพ์ข้อความ');
  if (d.value && requiresEvidence(d.kind, d.value) && !d.hasEvidence) errs.push('ต้องแนบรูปหรือวิดีโอที่ถ่ายใหม่เป็นหลักฐาน');
  return errs;
}
```

```ts
// src/lib/media.ts
import { FRESH_CAPTURE_MAX_AGE_MS } from '../core/config';

export function isFreshCapture(file: { lastModified: number }, now: number, maxAgeMs = FRESH_CAPTURE_MAX_AGE_MS): boolean {
  const age = now - file.lastModified;
  return age <= maxAgeMs && age >= -60_000;
}

export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max) return { w, h };
  const k = max / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Browser-only. Resizes and re-encodes as JPEG; EXIF (incl. GPS) is dropped by the canvas re-encode. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitWithin(bmp.width, bmp.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', quality));
}

/** Browser-only. */
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('video_unreadable')); };
    v.src = url;
  });
}
```

Run again → Expected: PASS.

- [ ] **Step 3: Write failing submit-classification and outbox tests**

```ts
// src/data/submit.test.ts
import { classifySubmitError, describeSubmitError } from './submit';

describe('classifySubmitError', () => {
  it.each(['Failed to fetch', 'TypeError: Load failed', 'NetworkError when attempting to fetch resource', 'rate_limited'])(
    'treats "%s" as retryable', (m) => expect(classifySubmitError(m).retryable).toBe(true));
  it.each(['evidence_required', 'invalid_value', 'unknown_target', 'device_blocked', 'committee_only', 'nickname_required'])(
    'treats "%s" as permanent', (m) => expect(classifySubmitError(m).retryable).toBe(false));
  it('treats unknown server errors as permanent so a bad item cannot loop forever', () => {
    expect(classifySubmitError('something odd').retryable).toBe(false);
  });
});
describe('describeSubmitError', () => {
  it('gives Thai messages', () => {
    expect(describeSubmitError('device_blocked')).toContain('ถูกระงับ');
    expect(describeSubmitError('rate_limited')).toContain('บ่อยเกินไป');
    expect(describeSubmitError('evidence_required')).toContain('หลักฐาน');
    expect(describeSubmitError('Failed to fetch')).toContain('อินเทอร์เน็ต');
  });
});
```

```ts
// src/data/outbox.test.ts
import { createOutbox } from './outbox';
import { memoryKV } from './kv';
import { SubmitError, type OutboxItem } from './submit';

const item = (id: string, createdAt: number): OutboxItem => ({
  id, createdAt, attempts: 0, blob: null, mediaType: null,
  draft: { deviceId: 'd', nickname: 'n', kind: 'road', targetId: 's', value: 'impassable', lat: null, lng: null, note: null },
});

it('removes an item after a successful send', async () => {
  const sent: string[] = [];
  const box = createOutbox({ store: memoryKV(), send: async (i) => { sent.push(i.id); } });
  await box.add(item('a', 1));
  expect(await box.flush()).toEqual({ sent: 1, failed: 0, stoppedOnRetry: false });
  expect(sent).toEqual(['a']);
  expect(await box.pending()).toHaveLength(0);
});
it('keeps the item and stops on a retryable error, preserving order', async () => {
  const tried: string[] = [];
  const box = createOutbox({ store: memoryKV(), send: async (i) => { tried.push(i.id); throw new SubmitError('offline', true); } });
  await box.add(item('b', 2)); await box.add(item('a', 1));
  const r = await box.flush();
  expect(r).toEqual({ sent: 0, failed: 0, stoppedOnRetry: true });
  expect(tried).toEqual(['a']);
  const pending = await box.pending();
  expect(pending.map((p) => p.id)).toEqual(['a', 'b']);
  expect(pending[0]!.attempts).toBe(1);
});
it('moves permanently failing items to the failed list and continues', async () => {
  const box = createOutbox({
    store: memoryKV(),
    send: async (i) => { if (i.id === 'bad') throw new SubmitError('invalid_value', false); },
  });
  await box.add(item('bad', 1)); await box.add(item('good', 2));
  expect(await box.flush()).toEqual({ sent: 1, failed: 1, stoppedOnRetry: false });
  expect((await box.failed()).map((f) => f.item.id)).toEqual(['bad']);
  await box.dismissFailed('bad');
  expect(await box.failed()).toHaveLength(0);
});
```

Run: `npx vitest run src/data/submit.test.ts src/data/outbox.test.ts` → Expected: FAIL.

- [ ] **Step 4: Implement KV, submit, and outbox**

```ts
// src/data/kv.ts
import { createStore, del, get, keys, set } from 'idb-keyval';

export interface KV {
  get<T>(k: string): Promise<T | undefined>;
  set(k: string, v: unknown): Promise<void>;
  del(k: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function memoryKV(): KV {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async keys() { return [...m.keys()]; },
  };
}

/** IndexedDB so photo/video blobs survive a closed tab while offline. */
export function idbKV(): KV {
  const store = createStore('flood', 'outbox');
  return {
    get: <T,>(k: string) => get<T>(k, store),
    set: (k, v) => set(k, v, store),
    del: (k) => del(k, store),
    keys: async () => (await keys(store)).map(String),
  };
}
```

```ts
// src/data/submit.ts
import type { ReportKind } from '../core/types';
import { supabase } from './supabase';

export interface ReportDraft {
  deviceId: string; nickname: string; kind: ReportKind; targetId: string; value: string;
  lat: number | null; lng: number | null; note: string | null;
}
export interface OutboxItem { id: string; draft: ReportDraft; blob: Blob | null; mediaType: string | null; attempts: number; createdAt: number }

export class SubmitError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); }
}

const PERMANENT = ['evidence_required', 'invalid_value', 'unknown_target', 'device_blocked', 'committee_only', 'nickname_required'];

export function classifySubmitError(message: string): SubmitError {
  if (PERMANENT.some((c) => message.includes(c))) return new SubmitError(message, false);
  if (message.includes('rate_limited')) return new SubmitError(message, true);
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) return new SubmitError(message, true);
  return new SubmitError(message, false);
}

export function describeSubmitError(message: string): string {
  if (message.includes('device_blocked')) return 'อุปกรณ์นี้ถูกระงับการรายงาน กรุณาติดต่อกรรมการ';
  if (message.includes('rate_limited')) return 'ส่งรายงานบ่อยเกินไป กรุณารอสักครู่';
  if (message.includes('evidence_required')) return 'ต้องแนบรูปหรือวิดีโอเป็นหลักฐาน';
  if (message.includes('committee_only')) return 'เฉพาะกรรมการเท่านั้น';
  if (message.includes('nickname_required')) return 'กรุณาใส่ชื่อเล่น';
  if (message.includes('invalid_value') || message.includes('unknown_target')) return 'ข้อมูลที่ส่งไม่ถูกต้อง';
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) return 'ไม่มีอินเทอร์เน็ต — เก็บรายงานไว้ในเครื่อง จะส่งให้อัตโนมัติเมื่อเชื่อมต่อได้';
  return 'ส่งรายงานไม่สำเร็จ';
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

export async function sendItem(item: OutboxItem): Promise<void> {
  let mediaPath: string | null = null;
  if (item.blob && item.mediaType) {
    mediaPath = `${item.draft.deviceId}/${item.id}.${EXT[item.mediaType] ?? 'bin'}`;
    const { error } = await supabase.storage.from('evidence').upload(mediaPath, item.blob, { contentType: item.mediaType, upsert: true });
    if (error) throw classifySubmitError(error.message);
  }
  const d = item.draft;
  const { error } = await supabase.rpc('submit_report', {
    p_device: d.deviceId, p_nickname: d.nickname, p_kind: d.kind, p_target: d.targetId, p_value: d.value,
    p_lat: d.lat, p_lng: d.lng, p_media_path: mediaPath, p_media_type: item.mediaType, p_note: d.note,
  });
  if (error) throw classifySubmitError(error.message);
}
```

```ts
// src/data/outbox.ts
import type { KV } from './kv';
import { SubmitError, type OutboxItem } from './submit';

export interface FailedItem { item: OutboxItem; reason: string }
const PENDING = 'pending:';
const FAILED = 'failed:';

export function createOutbox(deps: { store: KV; send: (item: OutboxItem) => Promise<void> }) {
  const { store, send } = deps;
  const load = async <T,>(prefix: string): Promise<T[]> => {
    const ks = (await store.keys()).filter((k) => k.startsWith(prefix));
    return (await Promise.all(ks.map((k) => store.get<T>(k)))).filter((x): x is T => !!x);
  };
  return {
    add: (item: OutboxItem) => store.set(PENDING + item.id, item),
    async pending(): Promise<OutboxItem[]> {
      return (await load<OutboxItem>(PENDING)).sort((a, b) => a.createdAt - b.createdAt);
    },
    failed: () => load<FailedItem>(FAILED),
    dismissFailed: (id: string) => store.del(FAILED + id),
    async flush(): Promise<{ sent: number; failed: number; stoppedOnRetry: boolean }> {
      const result = { sent: 0, failed: 0, stoppedOnRetry: false };
      for (const item of await this.pending()) {
        try {
          await send(item);
          await store.del(PENDING + item.id);
          result.sent++;
        } catch (e) {
          const err = e instanceof SubmitError ? e : new SubmitError((e as Error).message, false);
          if (err.retryable) {
            await store.set(PENDING + item.id, { ...item, attempts: item.attempts + 1 });
            result.stoppedOnRetry = true;
            break; // offline: don't hammer the rest
          }
          await store.set(FAILED + item.id, { item, reason: err.message } satisfies FailedItem);
          await store.del(PENDING + item.id);
          result.failed++;
        }
      }
      return result;
    },
  };
}
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run && npx tsc --noEmit` → Expected: all pass.

```bash
git add -A && git commit -m "feat: evidence validation, fresh-capture check, upload pipeline, offline outbox"
```

---

### Task 10: Report page (camera capture, location, nickname, consent)

**Files:**
- Create: `src/lib/useGeolocation.ts`, `src/ui/components/EvidenceCapture.tsx`, `src/ui/components/InPageCamera.tsx` (built only if Task 1 `CAPTURE_MODE` = `in-page`; the file is created either way and selected by `VITE_CAPTURE_MODE`), `src/ui/components/ConsentGate.tsx`, `src/ui/pages/ReportPage.tsx`, `src/state/outbox.ts`
- Modify: `src/ui/App.tsx` (add route `/report`), `.env.example` (add `VITE_CAPTURE_MODE=input-capture`)
- Test: `src/ui/pages/ReportPage.test.tsx`

**Interfaces:**
- Consumes: `validateDraft`, `requiresEvidence`, `isFreshCapture`, `compressImage`, `readVideoDuration`, `MAX_VIDEO_BYTES`, `MAX_VIDEO_SECONDS`, `getDeviceId`, `getNickname`, `setNickname`, `createOutbox`, `idbKV`, `sendItem`, `describeSubmitError`, `useData`, label maps.
- Produces: `interface Captured { blob: Blob; mediaType: string }`; `<EvidenceCapture required: boolean onChange(c: Captured | null) />`; `<InPageCamera onCaptured(c: Captured) onCancel() />`; `useGeolocation(): { pos: { lat: number; lng: number; accuracy: number } | null; error: string | null; refresh(): void }`; `outbox` singleton + `useOutboxCount(): number` (`src/state/outbox.ts`); route `/report?kind=road&target=<id>` (query params preselect).

- [ ] **Step 1: Outbox singleton and geolocation hook**

```ts
// src/state/outbox.ts
import { useEffect, useState } from 'react';
import { idbKV } from '../data/kv';
import { createOutbox } from '../data/outbox';
import { sendItem } from '../data/submit';

export const outbox = createOutbox({ store: idbKV(), send: sendItem });

export function useOutboxCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const refresh = async () => setN((await outbox.pending()).length);
    refresh();
    const t = setInterval(refresh, 5000);
    const flush = () => outbox.flush().then(refresh);
    flush();
    window.addEventListener('online', flush);
    return () => { clearInterval(t); window.removeEventListener('online', flush); };
  }, []);
  return n;
}
```

```ts
// src/lib/useGeolocation.ts
import { useCallback, useEffect, useState } from 'react';

export function useGeolocation() {
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (!('geolocation' in navigator)) { setError('unsupported'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setError(null); },
      (e) => setError(e.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, []);
  useEffect(refresh, [refresh]);
  return { pos, error, refresh };
}
```

- [ ] **Step 2: Evidence capture components**

```tsx
// src/ui/components/EvidenceCapture.tsx
import { useRef, useState } from 'react';
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from '../../core/config';
import { compressImage, isFreshCapture, readVideoDuration } from '../../lib/media';
import { InPageCamera } from './InPageCamera';

export interface Captured { blob: Blob; mediaType: string }
const MODE = import.meta.env.VITE_CAPTURE_MODE ?? 'input-capture';

export function EvidenceCapture({ required, onChange }: { required: boolean; onChange: (c: Captured | null) => void }) {
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; kind: 'image' | 'video' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);

  const accept = (c: Captured) => {
    setError(null);
    setPreview({ url: URL.createObjectURL(c.blob), kind: c.mediaType.startsWith('video') ? 'video' : 'image' });
    onChange(c);
  };
  const reject = (m: string) => { setError(m); setPreview(null); onChange(null); };

  async function onFile(file: File | undefined, kind: 'image' | 'video') {
    if (!file) return;
    if (!isFreshCapture(file, Date.now())) return reject('กรุณาถ่ายใหม่ในขณะนี้ ไม่ใช้รูปหรือวิดีโอจากคลังภาพ');
    try {
      if (kind === 'image') return accept({ blob: await compressImage(file), mediaType: 'image/jpeg' });
      if (file.size > MAX_VIDEO_BYTES) return reject('ไฟล์วิดีโอใหญ่เกินไป กรุณาถ่ายให้สั้นลง');
      if ((await readVideoDuration(file)) > MAX_VIDEO_SECONDS + 1) return reject(`วิดีโอยาวเกิน ${MAX_VIDEO_SECONDS} วินาที`);
      accept({ blob: file, mediaType: file.type.split(';')[0] || 'video/mp4' });
    } catch { reject('อ่านไฟล์ไม่ได้ กรุณาลองถ่ายใหม่'); }
  }

  if (camera) return <InPageCamera onCaptured={(c) => { setCamera(false); accept(c); }} onCancel={() => setCamera(false)} />;

  return (
    <div className="card">
      <strong>หลักฐาน {required ? <span className="conflict">(จำเป็น)</span> : '(ไม่บังคับ)'}</strong>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        {MODE === 'in-page' ? (
          <button type="button" onClick={() => setCamera(true)}>เปิดกล้อง</button>
        ) : (
          <>
            <button type="button" onClick={() => photoRef.current?.click()}>ถ่ายรูป</button>
            <button type="button" className="secondary" onClick={() => videoRef.current?.click()}>ถ่ายวิดีโอ</button>
          </>
        )}
      </div>
      <input ref={photoRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { onFile(e.target.files?.[0], 'image'); e.target.value = ''; }} />
      <input ref={videoRef} hidden type="file" accept="video/*" capture="environment" onChange={(e) => { onFile(e.target.files?.[0], 'video'); e.target.value = ''; }} />
      {error && <p className="conflict" role="alert">{error}</p>}
      {preview?.kind === 'image' && <img src={preview.url} alt="หลักฐาน" style={{ width: '100%', borderRadius: 8 }} />}
      {preview?.kind === 'video' && <video src={preview.url} controls playsInline style={{ width: '100%', borderRadius: 8 }} />}
    </div>
  );
}
```

```tsx
// src/ui/components/InPageCamera.tsx — used when VITE_CAPTURE_MODE=in-page (Task 1 decision)
import { useEffect, useRef, useState } from 'react';
import { MAX_VIDEO_SECONDS } from '../../core/config';
import type { Captured } from './EvidenceCapture';

export function InPageCamera({ onCaptured, onCancel }: { onCaptured: (c: Captured) => void; onCancel: () => void }) {
  const videoEl = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: true });
        videoEl.current!.srcObject = stream.current;
        await videoEl.current!.play();
      } catch { setError('เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์'); }
    })();
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const snap = () => {
    const v = videoEl.current!;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCaptured({ blob: b, mediaType: 'image/jpeg' }), 'image/jpeg', 0.8);
  };
  const start = () => {
    if (!stream.current || typeof MediaRecorder === 'undefined') return setError('อุปกรณ์นี้อัดวิดีโอในหน้าเว็บไม่ได้ กรุณาใช้ถ่ายรูป');
    const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    const rec = new MediaRecorder(stream.current, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => onCaptured({ blob: new Blob(chunks.current, { type: mime }), mediaType: mime });
    rec.start();
    recorder.current = rec;
    setRecording(true);
    setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_VIDEO_SECONDS * 1000);
  };
  const stop = () => { recorder.current?.state === 'recording' && recorder.current.stop(); setRecording(false); };

  return (
    <div className="card">
      <video ref={videoEl} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
      {error && <p className="conflict" role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {!recording && <button type="button" onClick={snap}>ถ่ายรูป</button>}
        {!recording ? <button type="button" className="secondary" onClick={start}>อัดวิดีโอ (สูงสุด {MAX_VIDEO_SECONDS} วินาที)</button>
                    : <button type="button" onClick={stop}>หยุดอัด</button>}
        <button type="button" className="secondary" onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  );
}
```

```tsx
// src/ui/components/ConsentGate.tsx
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'flood.consent.v1';
const read = () => { try { return localStorage.getItem(KEY) === 'yes'; } catch { return false; } };

export function ConsentGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(read);
  if (ok) return <>{children}</>;
  return (
    <div className="card">
      <p>เมื่อส่งรายงาน ระบบจะเก็บ <b>ชื่อเล่น รูป/วิดีโอ และตำแหน่งขณะส่ง</b> ไว้ 30 วัน เพื่อใช้ยืนยันสถานะถนนในหมู่บ้าน
        โดยมีกรรมการหมู่บ้านเป็นผู้ดูแลข้อมูล อย่าถ่ายใบหน้า ป้ายทะเบียน หรือเลขที่บ้านของผู้อื่น</p>
      <p><Link to="/privacy">อ่านประกาศความเป็นส่วนตัว</Link></p>
      <button onClick={() => { try { localStorage.setItem(KEY, 'yes'); } catch { /* ignore */ } setOk(true); }}>ยอมรับและส่งรายงานต่อ</button>
    </div>
  );
}
```

- [ ] **Step 3: Write the failing report-page test**

```tsx
// src/ui/pages/ReportPage.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ReportPage } from './ReportPage';

vi.mock('../../state/SnapshotContext', () => ({
  useData: () => ({
    now: 1, error: null, loading: false, reload() {},
    snapshot: {
      segments: [{ id: 'seg1', name: 'ซอย 1' }], marks: [], places: [], reports: [], feed: [],
      settings: { ttlMs: {}, agencyMaxAgeMs: 1, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
    },
  }),
}));
vi.mock('../../state/outbox', () => ({ outbox: { add: vi.fn(), failed: vi.fn().mockResolvedValue([]), flush: vi.fn().mockResolvedValue({ sent: 0, failed: 0, stoppedOnRetry: false }) }, useOutboxCount: () => 0 }));
vi.mock('../../lib/useGeolocation', () => ({ useGeolocation: () => ({ pos: null, error: 'denied', refresh() {} }) }));

beforeEach(() => { localStorage.setItem('flood.consent.v1', 'yes'); localStorage.setItem('flood.nickname', 'สมชาย'); });

const open = () => render(<MemoryRouter initialEntries={['/report?kind=road&target=seg1']}><ReportPage /></MemoryRouter>);

it('blocks a "รถเล็กไปได้" report that has no photo and explains why', async () => {
  open();
  await userEvent.click(screen.getByLabelText('รถเล็กไปได้'));
  await userEvent.click(screen.getByRole('button', { name: 'ส่งรายงาน' }));
  expect(screen.getByText('ต้องแนบรูปหรือวิดีโอที่ถ่ายใหม่เป็นหลักฐาน')).toBeInTheDocument();
});
it('marks evidence as required for passable claims and optional for ผ่านไม่ได้', async () => {
  open();
  await userEvent.click(screen.getByLabelText('รถเล็กไปได้'));
  expect(screen.getByText('(จำเป็น)')).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText('ผ่านไม่ได้'));
  expect(screen.getByText('(ไม่บังคับ)')).toBeInTheDocument();
});
it('warns when location is unavailable', () => {
  open();
  expect(screen.getByText(/ไม่ได้ตำแหน่ง/)).toBeInTheDocument();
});
```

Run: `npx vitest run src/ui/pages/ReportPage.test.tsx` → Expected: FAIL (module missing).

- [ ] **Step 4: Implement the report page**

```tsx
// src/ui/pages/ReportPage.tsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requiresEvidence } from '../../core/evidence';
import { STATUS_LABEL_TH, SUPPLY_LABEL_TH } from '../../core/labels';
import type { ReportKind } from '../../core/types';
import { validateDraft } from '../../core/validate';
import { getDeviceId, getNickname, setNickname } from '../../data/device';
import { describeSubmitError, type OutboxItem } from '../../data/submit';
import { useGeolocation } from '../../lib/useGeolocation';
import { outbox, useOutboxCount } from '../../state/outbox';
import { useData } from '../../state/SnapshotContext';
import { ConsentGate } from '../components/ConsentGate';
import { EvidenceCapture, type Captured } from '../components/EvidenceCapture';

const KINDS: [ReportKind, string][] = [['road', 'สภาพถนน'], ['water_level', 'ระดับน้ำ'], ['supply', 'จุดเสบียง'], ['general', 'ข้อความทั่วไป']];
const ROAD_VALUES = ['dry', 'small_car', 'high_clearance', 'impassable'] as const;
const SUPPLY_VALUES = ['open', 'closed', 'out_of_stock', 'unreachable'] as const;

export function ReportPage() {
  const { snapshot } = useData();
  const [params] = useSearchParams();
  const initialKind = (params.get('kind') as ReportKind) || 'road';
  const [kind, setKind] = useState<ReportKind>(KINDS.some(([k]) => k === initialKind) ? initialKind : 'road');
  const [targetId, setTargetId] = useState(params.get('target') ?? '');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [nickname, setNick] = useState(getNickname());
  const [evidence, setEvidence] = useState<Captured | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { pos, error: geoError, refresh } = useGeolocation();
  const pendingCount = useOutboxCount();
  const s = snapshot!;

  const targets: { id: string; name: string }[] =
    kind === 'road' ? s.segments : kind === 'water_level' ? s.marks : kind === 'supply' ? s.places
    : [{ id: 'village', name: 'ทั่วไป' }];
  const generalTarget = kind === 'general' ? 'village' : targetId;
  const values: { v: string; label: string }[] =
    kind === 'road' ? ROAD_VALUES.map((v) => ({ v, label: STATUS_LABEL_TH[v] }))
    : kind === 'supply' ? SUPPLY_VALUES.map((v) => ({ v, label: SUPPLY_LABEL_TH[v] }))
    : kind === 'water_level' ? (s.marks.find((m) => m.id === targetId)?.levels ?? []).map((l) => ({ v: String(l.level), label: l.label }))
    : [{ v: 'note', label: 'ข้อความ' }];
  const effectiveValue = kind === 'general' ? 'note' : value;
  const evidenceRequired = !!effectiveValue && requiresEvidence(kind, effectiveValue);

  async function submit() {
    const errs = validateDraft({ kind, targetId: generalTarget, value: effectiveValue, nickname, hasEvidence: !!evidence, note });
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    setNickname(nickname);
    const item: OutboxItem = {
      id: crypto.randomUUID(), createdAt: Date.now(), attempts: 0, blob: evidence?.blob ?? null, mediaType: evidence?.mediaType ?? null,
      draft: { deviceId: getDeviceId(), nickname: nickname.trim(), kind, targetId: generalTarget, value: effectiveValue, lat: pos?.lat ?? null, lng: pos?.lng ?? null, note: kind === 'general' ? note.trim() : null },
    };
    await outbox.add(item);
    const r = await outbox.flush();
    setBusy(false);
    if (r.failed) { const f = (await outbox.failed()).at(-1); setErrors([describeSubmitError(f?.reason ?? '')]); }
    else if (r.stoppedOnRetry) setDone('ยังส่งไม่สำเร็จ — เก็บรายงานไว้ในเครื่องแล้ว จะส่งให้อัตโนมัติเมื่อเชื่อมต่อได้');
    else setDone('ส่งรายงานแล้ว ขอบคุณครับ/ค่ะ');
  }

  if (done) return <div className="page"><div className="card"><p>{done}</p><button onClick={() => { setDone(null); setValue(''); setEvidence(null); setNote(''); }}>รายงานเพิ่ม</button></div></div>;

  return (
    <div className="page">
      <h1>ส่งรายงาน</h1>
      {pendingCount > 0 && <div className="banner banner--warn">มี {pendingCount} รายงานรอส่ง จะส่งให้อัตโนมัติเมื่อมีอินเทอร์เน็ต</div>}
      <ConsentGate>
        <div className="card">
          <strong>ประเภท</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {KINDS.map(([k, label]) => (
              <button key={k} type="button" className={k === kind ? '' : 'secondary'} onClick={() => { setKind(k); setTargetId(''); setValue(''); setEvidence(null); }}>{label}</button>
            ))}
          </div>
        </div>
        {kind !== 'general' && (
          <div className="card">
            <label>จุดที่รายงาน
              <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setValue(''); }} style={{ width: '100%', minHeight: 44 }}>
                <option value="">— เลือก —</option>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <fieldset className="card"><legend>สถานะ</legend>
          {kind === 'general'
            ? <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} style={{ width: '100%' }} placeholder="พิมพ์ข้อความ" />
            : values.map((o) => (
              <label key={o.v} style={{ display: 'block', padding: '8px 0' }}>
                <input type="radio" name="value" checked={value === o.v} onChange={() => setValue(o.v)} /> {o.label}
              </label>))}
        </fieldset>
        {kind !== 'general' && <EvidenceCapture required={evidenceRequired} onChange={setEvidence} />}
        <div className="card">
          <label>ชื่อเล่น <input value={nickname} onChange={(e) => setNick(e.target.value)} maxLength={40} style={{ width: '100%', minHeight: 44 }} /></label>
          <p className="age">
            {pos ? `ได้ตำแหน่งแล้ว (±${Math.round(pos.accuracy)} ม.)`
              : geoError ? 'ไม่ได้ตำแหน่ง — รายงานจะรอกรรมการยืนยันก่อนมีผลต่อสถานะ ' : 'กำลังหาตำแหน่ง… '}
            {!pos && <button type="button" className="secondary" onClick={refresh}>ลองอีกครั้ง</button>}
          </p>
        </div>
        {errors.length > 0 && <ul role="alert" className="conflict">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <button type="button" disabled={busy} onClick={submit}>ส่งรายงาน</button>
      </ConsentGate>
    </div>
  );
}
```

- [ ] **Step 5: Wire the route, run tests, commit**

In `src/ui/App.tsx` add `import { ReportPage } from './pages/ReportPage';` and, inside the `<Route element={<Layout />}>`, `<Route path="report" element={<ReportPage />} />`. Add `VITE_CAPTURE_MODE=input-capture` to `.env.example` (set `in-page` in `.env` if Task 1 decided so).

Run: `npx vitest run && npx tsc --noEmit` → Expected: all pass.

Manual check (dev server + a real phone on the same Wi-Fi via the Vite `--host` URL, or the Task 1 devices): submit `ผ่านไม่ได้` with no photo → appears in `select * from reports order by created_at desc limit 1` with `location_ok=true` when near the demo segment; submit `รถเล็กไปได้` with a fresh photo → row has `media_path`, the file is present in Storage; try choosing an old gallery photo → blocked with the Thai message; switch the phone to airplane mode, submit, see the pending banner, turn Wi-Fi back on → it sends.

```bash
git add -A && git commit -m "feat(report): report page with fresh-capture evidence, geolocation, consent and offline queue"
```

---

### Task 11: Derived states, report cards, and the map page

**Files:**
- Create: `src/state/derive.ts`, `src/state/describe.ts`, `src/ui/map/geojson.ts`, `src/ui/map/MapView.tsx`, `src/ui/components/FeedItemCard.tsx`, `src/ui/components/Legend.tsx`, `src/ui/pages/MapPage.tsx`
- Modify: `src/ui/App.tsx` (add route `/map`)
- Test: `src/state/derive.test.ts`, `src/state/describe.test.ts`, `src/ui/map/geojson.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `FeedItem`, `SegmentRow`, `PlaceRow`, `IncidentRow` (data/types); `resolveRoadSegments`, `resolveWaterLevel`, `resolveSupply`; `STATUS_LABEL_TH`, `SUPPLY_LABEL_TH`, `STATUS_COLOR`; `RouteDef`.
- Produces: `derive(s: Snapshot, now: number): { segmentStates: Record<string, Resolved<RoadStatus>>; markStates: Record<string, Resolved<string>>; placeStates: Record<string, Resolved<SupplyStatus>> }`; `describeFeedItem(item: FeedItem, s: Snapshot): { target: string; valueLabel: string }`; `segmentFeatureCollection(segments: SegmentRow[], states: Record<string, Resolved<RoadStatus>>, highlightIds?: string[]): FeatureCollection<LineString, { id: string; name: string; state: SegmentState; conflict: boolean; highlight: boolean }>`; `routeLine(route: RouteDef, segments: SegmentRow[]): Feature<MultiLineString>`; `<MapView segments states highlightIds? places? incidents? center onSelectSegment? height? />`; `<FeedItemCard item snapshot now />`; `<Legend />`

- [ ] **Step 1: Write failing tests**

```ts
// src/state/derive.test.ts
import { derive } from './derive';
import type { Snapshot } from '../data/types';
import type { Report } from '../core/types';
import { HOUR } from '../core/config';

const NOW = 1_000_000_000_000;
const rep = (o: Partial<Report>): Report => ({
  id: Math.random().toString(), kind: 'road', targetId: 'seg1', value: 'dry', createdAt: NOW - 60_000,
  hasEvidence: true, locationOk: true, byCommittee: false, confirmedByCommittee: false, ...o,
});
const snap = (reports: Report[]): Snapshot => ({
  segments: [{ id: 'seg1', name: 'a', geojson: { type: 'LineString', coordinates: [] } }, { id: 'seg2', name: 'b', geojson: { type: 'LineString', coordinates: [] } }],
  marks: [{ id: 'm1', name: 'm', geojson: { type: 'Point', coordinates: [0, 0] }, levels: [] }],
  places: [{ id: 'p1', name: 'p', category: 'store', geojson: { type: 'Point', coordinates: [0, 0] } }],
  reports, settings: { ttlMs: { road: 3 * HOUR, water_level: 2 * HOUR, supply: 12 * HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
} as unknown as Snapshot);

it('derives states per target kind using the committee TTL settings', () => {
  const d = derive(snap([
    rep({ targetId: 'seg1', value: 'dry' }),
    rep({ kind: 'water_level', targetId: 'm1', value: '2' }),
    rep({ kind: 'supply', targetId: 'p1', value: 'open', hasEvidence: false }),
  ]), NOW);
  expect(d.segmentStates.seg1?.value).toBe('dry');
  expect(d.segmentStates.seg2?.value).toBe('unknown');
  expect(d.markStates.m1?.value).toBe('2');
  expect(d.placeStates.p1?.value).toBe('open');
});
it('turns a 4-hour-old road report into unknown', () => {
  expect(derive(snap([rep({ createdAt: NOW - 4 * HOUR })]), NOW).segmentStates.seg1?.value).toBe('unknown');
});
```

```ts
// src/state/describe.test.ts
import { describeFeedItem } from './describe';
import type { FeedItem, Snapshot } from '../data/types';

const s = {
  segments: [{ id: 'seg1', name: 'ซอย 1' }],
  marks: [{ id: 'm1', name: 'กำแพงริมคลอง', levels: [{ level: 2, label: 'ขีดที่ 2' }] }],
  places: [{ id: 'p1', name: 'ร้านป้าแดง' }],
} as unknown as Snapshot;
const item = (o: Partial<FeedItem>): FeedItem => ({
  id: 'x', kind: 'road', targetId: 'seg1', value: 'small_car', nickname: 'n', createdAt: 0, mediaUrl: null, mediaType: null,
  note: null, byCommittee: false, confirmedByCommittee: false, confirmations: 0, locationOk: true, ...o,
});

it('describes a road report', () => expect(describeFeedItem(item({}), s)).toEqual({ target: 'ซอย 1', valueLabel: 'รถเล็กไปได้' }));
it('describes a water level via the mark label', () =>
  expect(describeFeedItem(item({ kind: 'water_level', targetId: 'm1', value: '2' }), s)).toEqual({ target: 'กำแพงริมคลอง', valueLabel: 'ขีดที่ 2' }));
it('describes supply', () =>
  expect(describeFeedItem(item({ kind: 'supply', targetId: 'p1', value: 'out_of_stock' }), s)).toEqual({ target: 'ร้านป้าแดง', valueLabel: 'ของหมด' }));
it('uses the note text for general messages and names committee targets', () => {
  expect(describeFeedItem(item({ kind: 'general', targetId: 'wall', value: 'note', note: 'น้ำใกล้ล้น' }), s)).toEqual({ target: 'กำแพงริมคลอง', valueLabel: 'น้ำใกล้ล้น' });
  expect(describeFeedItem(item({ kind: 'general', targetId: 'drainage', value: 'note', note: 'เปิดเครื่องสูบ' }), s).target).toBe('การระบายน้ำ');
  expect(describeFeedItem(item({ kind: 'general', targetId: 'village', value: 'note', note: 'ทดสอบ' }), s).target).toBe('ทั่วไป');
});
it('falls back gracefully for unknown targets', () => expect(describeFeedItem(item({ targetId: 'gone' }), s).target).toBe('(จุดที่ถูกลบ)'));
```

```ts
// src/ui/map/geojson.test.ts
import { segmentFeatureCollection, routeLine } from './geojson';

const segs = [
  { id: 'a', name: 'A', geojson: { type: 'LineString' as const, coordinates: [[100, 13], [100.1, 13.1]] } },
  { id: 'b', name: 'B', geojson: { type: 'LineString' as const, coordinates: [[100.1, 13.1], [100.2, 13.2]] } },
];
it('builds features carrying state, conflict and highlight', () => {
  const fc = segmentFeatureCollection(segs, { a: { value: 'impassable', asOf: 1, conflict: true, basisReportId: 'r' } }, ['b']);
  expect(fc.features[0]!.properties).toEqual({ id: 'a', name: 'A', state: 'impassable', conflict: true, highlight: false });
  expect(fc.features[1]!.properties).toEqual({ id: 'b', name: 'B', state: 'unknown', conflict: false, highlight: true });
});
it('joins a route from its segments in order and skips missing ones', () => {
  const f = routeLine({ id: 'r', name: 'r', destinationId: 'd', segmentIds: ['b', 'zzz', 'a'], waypoints: [], distanceM: 1 }, segs);
  expect(f.geometry.coordinates).toEqual([segs[1]!.geojson.coordinates, segs[0]!.geojson.coordinates]);
});
```

Run: `npx vitest run src/state src/ui/map` → Expected: FAIL.

- [ ] **Step 2: Implement derive, describe, geojson**

```ts
// src/state/derive.ts
import { resolveRoadSegments, resolveSupply, resolveWaterLevel } from '../core/status';
import type { Resolved, RoadStatus, SupplyStatus } from '../core/types';
import type { Snapshot } from '../data/types';

export interface Derived {
  segmentStates: Record<string, Resolved<RoadStatus>>;
  markStates: Record<string, Resolved<string>>;
  placeStates: Record<string, Resolved<SupplyStatus>>;
}

export function derive(s: Snapshot, now: number): Derived {
  const { ttlMs } = s.settings;
  const segmentStates = resolveRoadSegments(s.reports, s.segments.map((x) => x.id), now, ttlMs.road);
  const markStates: Derived['markStates'] = {};
  for (const m of s.marks) markStates[m.id] = resolveWaterLevel(s.reports.filter((r) => r.kind === 'water_level' && r.targetId === m.id), now, ttlMs.water_level);
  const placeStates: Derived['placeStates'] = {};
  for (const p of s.places) placeStates[p.id] = resolveSupply(s.reports.filter((r) => r.kind === 'supply' && r.targetId === p.id), now, ttlMs.supply);
  return { segmentStates, markStates, placeStates };
}
```

```ts
// src/state/describe.ts
import { STATUS_LABEL_TH, SUPPLY_LABEL_TH } from '../core/labels';
import type { RoadStatus, SupplyStatus } from '../core/types';
import type { FeedItem, Snapshot } from '../data/types';

const GENERAL_TARGETS: Record<string, string> = { village: 'ทั่วไป', wall: 'กำแพงริมคลอง', drainage: 'การระบายน้ำ' };

export function describeFeedItem(item: FeedItem, s: Snapshot): { target: string; valueLabel: string } {
  const missing = '(จุดที่ถูกลบ)';
  if (item.kind === 'road') return { target: s.segments.find((x) => x.id === item.targetId)?.name ?? missing, valueLabel: STATUS_LABEL_TH[item.value as RoadStatus] ?? item.value };
  if (item.kind === 'supply') return { target: s.places.find((x) => x.id === item.targetId)?.name ?? missing, valueLabel: SUPPLY_LABEL_TH[item.value as SupplyStatus] ?? item.value };
  if (item.kind === 'water_level') {
    const mark = s.marks.find((x) => x.id === item.targetId);
    return { target: mark?.name ?? missing, valueLabel: mark?.levels.find((l) => String(l.level) === item.value)?.label ?? `ระดับ ${item.value}` };
  }
  return { target: GENERAL_TARGETS[item.targetId] ?? 'ทั่วไป', valueLabel: item.note ?? '' };
}
```

Note: the `wall` target is described as "กำแพงริมคลอง" — a general report targeting `wall` and a water mark named the same are different things; both read naturally to residents.

```ts
// src/ui/map/geojson.ts
import type { Feature, FeatureCollection, LineString, MultiLineString } from 'geojson';
import type { RouteDef } from '../../core/routes';
import type { Resolved, RoadStatus, SegmentState } from '../../core/types';
import type { SegmentRow } from '../../data/types';

export type SegmentProps = { id: string; name: string; state: SegmentState; conflict: boolean; highlight: boolean };

export function segmentFeatureCollection(
  segments: SegmentRow[], states: Record<string, Resolved<RoadStatus>>, highlightIds: string[] = [],
): FeatureCollection<LineString, SegmentProps> {
  return {
    type: 'FeatureCollection',
    features: segments.map((s) => ({
      type: 'Feature', geometry: s.geojson,
      properties: { id: s.id, name: s.name, state: states[s.id]?.value ?? 'unknown', conflict: states[s.id]?.conflict ?? false, highlight: highlightIds.includes(s.id) },
    })),
  };
}

export function routeLine(route: RouteDef, segments: SegmentRow[]): Feature<MultiLineString> {
  const byId = new Map(segments.map((s) => [s.id, s]));
  const lines = route.segmentIds.map((id) => byId.get(id)?.geojson.coordinates).filter((c): c is number[][] => !!c);
  return { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } };
}
```

Run: `npx vitest run src/state src/ui/map` → Expected: PASS.

- [ ] **Step 3: Implement MapView, Legend, FeedItemCard**

```tsx
// src/ui/map/MapView.tsx
import maplibregl, { type GeoJSONSource, type Map } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { STATUS_COLOR } from '../../core/labels';
import type { LatLng, Resolved, RoadStatus } from '../../core/types';
import type { IncidentRow, PlaceRow, SegmentRow } from '../../data/types';
import { segmentFeatureCollection } from './geojson';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'; // free, no key, no view limit

interface Props {
  segments: SegmentRow[]; states: Record<string, Resolved<RoadStatus>>; highlightIds?: string[];
  places?: PlaceRow[]; incidents?: IncidentRow[]; center: LatLng; zoom?: number; height?: string;
  onSelectSegment?: (id: string) => void;
}

const points = (rows: { lng: number; lat: number; props: Record<string, unknown> }[]) => ({
  type: 'FeatureCollection' as const,
  features: rows.map((r) => ({ type: 'Feature' as const, properties: r.props, geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] } })),
});

export function MapView({ segments, states, highlightIds, places = [], incidents = [], center, zoom = 14, height = '55dvh', onSelectSegment }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const ready = useRef(false);
  const onSelect = useRef(onSelectSegment);
  onSelect.current = onSelectSegment;
  const latest = useRef({ segments, states, highlightIds, places, incidents });
  latest.current = { segments, states, highlightIds, places, incidents };

  const push = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const l = latest.current;
    (m.getSource('segments') as GeoJSONSource).setData(segmentFeatureCollection(l.segments, l.states, l.highlightIds));
    (m.getSource('places') as GeoJSONSource).setData(points(l.places.map((p) => ({ lng: p.geojson.coordinates[0]!, lat: p.geojson.coordinates[1]!, props: { name: p.name } }))));
    (m.getSource('incidents') as GeoJSONSource).setData(points(l.incidents.map((i) => ({ lng: i.lng, lat: i.lat, props: { title: i.title } }))));
  };

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: STYLE, center: [center.lng, center.lat], zoom, attributionControl: { compact: true } });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');
    m.on('load', () => {
      for (const id of ['segments', 'places', 'incidents']) m.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const color = ['match', ['get', 'state'], 'dry', STATUS_COLOR.dry, 'small_car', STATUS_COLOR.small_car, 'high_clearance', STATUS_COLOR.high_clearance, 'impassable', STATUS_COLOR.impassable, STATUS_COLOR.unknown] as any;
      m.addLayer({ id: 'seg-known', type: 'line', source: 'segments', filter: ['!=', ['get', 'state'], 'unknown'], layout: { 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': ['case', ['get', 'highlight'], 9, 6] } });
      m.addLayer({ id: 'seg-unknown', type: 'line', source: 'segments', filter: ['==', ['get', 'state'], 'unknown'],
        paint: { 'line-color': STATUS_COLOR.unknown, 'line-width': ['case', ['get', 'highlight'], 8, 5], 'line-dasharray': [1.5, 1.5] } });
      m.addLayer({ id: 'places', type: 'circle', source: 'places', paint: { 'circle-radius': 7, 'circle-color': '#0b5cab', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      m.addLayer({ id: 'incidents', type: 'circle', source: 'incidents', paint: { 'circle-radius': 8, 'circle-color': '#7b2cbf', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      for (const layer of ['seg-known', 'seg-unknown']) {
        m.on('click', layer, (e) => { const id = e.features?.[0]?.properties?.id; if (id) onSelect.current?.(String(id)); });
        m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
      }
      ready.current = true;
      push();
    });
    return () => { ready.current = false; m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(push, [segments, states, highlightIds, places, incidents]);
  return <div ref={el} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }} aria-label="แผนที่สถานะถนน" />;
}
```

```tsx
// src/ui/components/Legend.tsx
import { STATUS_COLOR, STATUS_LABEL_TH } from '../../core/labels';
import type { SegmentState } from '../../core/types';

const ORDER: SegmentState[] = ['dry', 'small_car', 'high_clearance', 'impassable', 'unknown'];
export const Legend = () => (
  <ul className="legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', listStyle: 'none', padding: 0, margin: '8px 0', fontSize: 13 }}>
    {ORDER.map((s) => (
      <li key={s}><span style={{ display: 'inline-block', width: 22, height: 0, borderTop: `5px ${s === 'unknown' ? 'dashed' : 'solid'} ${STATUS_COLOR[s]}`, verticalAlign: 'middle', marginRight: 4 }} />{STATUS_LABEL_TH[s]}</li>
    ))}
  </ul>
);
```

```tsx
// src/ui/components/FeedItemCard.tsx
import { getDeviceId } from '../../data/device';
import type { FeedItem, Snapshot } from '../../data/types';
import { supabase } from '../../data/supabase';
import { describeFeedItem } from '../../state/describe';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from './AgeLabel';

export function FeedItemCard({ item, snapshot, now }: { item: FeedItem; snapshot: Snapshot; now: number }) {
  const { reload } = useData();
  const { target, valueLabel } = describeFeedItem(item, snapshot);
  const confirm = async () => { await supabase.rpc('confirm_report', { p_device: getDeviceId(), p_report: item.id }); reload(); };
  return (
    <article className="card">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{target}</strong><AgeLabel at={item.createdAt} now={now} />
      </header>
      <p style={{ margin: '4px 0' }}>{valueLabel}</p>
      {item.mediaUrl && (item.mediaType?.startsWith('video')
        ? <video src={item.mediaUrl} controls playsInline preload="none" style={{ width: '100%', borderRadius: 8 }} />
        : <a href={item.mediaUrl} target="_blank" rel="noreferrer"><img src={item.mediaUrl} alt={`หลักฐาน ${target}`} loading="lazy" style={{ width: '100%', borderRadius: 8 }} /></a>)}
      <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
        <span>โดย {item.nickname}</span>
        {item.mediaUrl && <span>· มีรูป/วิดีโอยืนยัน</span>}
        {(item.byCommittee || item.confirmedByCommittee) && <b>· กรรมการยืนยัน</b>}
        {item.confirmations > 0 && <span>· ผู้อื่นยืนยัน ({item.confirmations} คน)</span>}
        {!item.locationOk && !item.byCommittee && !item.confirmedByCommittee && <span className="conflict">· ตำแหน่งไม่ตรง (ยังไม่มีผลต่อสถานะ)</span>}
        {item.kind !== 'general' && <button type="button" className="secondary" onClick={confirm} style={{ marginLeft: 'auto', minHeight: 36, padding: '4px 10px' }}>ยืนยัน</button>}
      </footer>
    </article>
  );
}
```

- [ ] **Step 4: Implement the map page and wire the route**

```tsx
// src/ui/pages/MapPage.tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LONGDO_CREDIT_TH } from '../../core/config';
import { derive } from '../../state/derive';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from '../components/AgeLabel';
import { FeedItemCard } from '../components/FeedItemCard';
import { Legend } from '../components/Legend';
import { StatusBadge } from '../components/StatusBadge';
import { MapView } from '../map/MapView';

export function MapPage() {
  const { snapshot: s, now } = useData();
  const snap = s!;
  const [selected, setSelected] = useState<string | null>(null);
  const [showPlaces, setShowPlaces] = useState(false);
  const [showIncidents, setShowIncidents] = useState(false);
  const d = useMemo(() => derive(snap, now), [snap, now]);
  const seg = snap.segments.find((x) => x.id === selected);
  const st = selected ? d.segmentStates[selected] : undefined;
  const items = snap.feed.filter((f) => f.kind === 'road' && f.targetId === selected).slice(0, 5);

  return (
    <div className="page">
      <MapView segments={snap.segments} states={d.segmentStates} highlightIds={selected ? [selected] : []}
        places={showPlaces ? snap.places : []} incidents={showIncidents ? snap.incidents.filter((i) => i.stopAt > now) : []}
        center={snap.settings.origin} onSelectSegment={setSelected} />
      <Legend />
      <label><input type="checkbox" checked={showPlaces} onChange={(e) => setShowPlaces(e.target.checked)} /> จุดเสบียง</label>{' '}
      <label><input type="checkbox" checked={showIncidents} onChange={(e) => setShowIncidents(e.target.checked)} /> เหตุน้ำท่วมจาก Longdo</label>
      {showIncidents && <p className="age">{LONGDO_CREDIT_TH}</p>}
      {seg && st && (
        <section className="card">
          <h2 style={{ margin: 0 }}>{seg.name}</h2>
          <StatusBadge state={st.value} conflict={st.conflict} /> <AgeLabel at={st.asOf} now={now} />
          {st.value === 'unknown' && <p className="age">ยังไม่มีรายงานล่าสุดที่ยืนยันได้ — ห้ามถือว่าผ่านได้</p>}
          <p><Link className="btn" to={`/report?kind=road&target=${seg.id}`}>รายงานช่วงนี้</Link></p>
          {items.map((i) => <FeedItemCard key={i.id} item={i} snapshot={snap} now={now} />)}
        </section>
      )}
    </div>
  );
}
```

In `src/ui/App.tsx` add `import { MapPage } from './pages/MapPage';` and `<Route path="map" element={<MapPage />} />`.

- [ ] **Step 5: Run tests and verify in the browser**

Run: `npx vitest run && npx tsc --noEmit` → Expected: all pass.

With the demo seed: `npm run dev`, open `/map`. Expected: base map loads (OpenFreeMap), two dashed gray segments ("ไม่ทราบ"). Post a `ผ่านไม่ได้` report for `seg-demo-1` via `/report` → within a minute (or after pull-to-refresh/reload) that segment turns solid red, tapping it shows the badge, "อัปเดต เมื่อสักครู่", and the report card. Wait is not required for the 3-hour expiry — that is covered by `derive.test.ts`. Check the console for errors.

```bash
git add -A && git commit -m "feat(map): derived states, report cards, MapLibre status map with legend"
```

---

### Task 12: Home page (agency data, warnings, committee notes, feed)

**Files:**
- Create: `src/state/agencyView.ts`, `src/ui/components/{GaugeCard,RainCard,WarningList}.tsx`, `src/ui/pages/HomePage.tsx`
- Modify: `src/ui/App.tsx` (replace the temporary index route with `HomePage`)
- Test: `src/state/agencyView.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `AgencyReading`, `WarningRow`, `FeedItem`; `freshness`, `trend`, `gaugeState`, `Trend`, `GaugeState`; `PRIMARY_GAUGE`, `WARNING_MAX_AGE_MS`, `TTL_MS`; `derive`.
- Produces: `interface GaugeView { stationId: string; name: string; source: string; value: number; unit: string; observedAt: number; ageMs: number; stale: boolean; trend: Trend; state: GaugeState; thresholds: { watch: number; danger: number } | null }`; `interface RainView { stationId: string; name: string; rf1hr: number | null; rf24hr: number | null; observedAt: number; stale: boolean }`; `agencyView(s: Snapshot, now: number): { primary: GaugeView | null; others: GaugeView[]; rain: RainView[] }`; `visibleWarnings(s: Snapshot, now: number): WarningRow[]` (≤ 48 h, Bangkok-mentioning first); `committeeNote(s: Snapshot, target: 'wall' | 'drainage', now: number): { note: string; createdAt: number; stale: boolean } | null`

- [ ] **Step 1: Write the failing tests**

```ts
// src/state/agencyView.test.ts
import { agencyView, visibleWarnings, committeeNote } from './agencyView';
import type { AgencyReading, FeedItem, Snapshot } from '../data/types';
import { HOUR, MINUTE } from '../core/config';

const NOW = 1_000_000_000_000;
const R = (o: Partial<AgencyReading>): AgencyReading => ({
  source: 'bma_canal', stationId: 'WL.STN.02', stationName: 'ค.สองต้นนุ่น', lat: 0, lng: 0, metric: 'wl_in', value: 0.7, unit: 'm', observedAt: NOW - 5 * MINUTE, ...o,
});
const snap = (latest: AgencyReading[], recent: AgencyReading[] = latest, extra: Partial<Snapshot> = {}): Snapshot => ({
  latest, recent, warnings: [], feed: [],
  settings: { ttlMs: { road: 0, water_level: 0, supply: 12 * HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
  ...extra,
} as unknown as Snapshot);

describe('agencyView', () => {
  it('finds the primary gauge, uncalibrated when no thresholds are set', () => {
    const v = agencyView(snap([R({})]), NOW);
    expect(v.primary).toMatchObject({ stationId: 'WL.STN.02', value: 0.7, stale: false, state: 'uncalibrated', thresholds: null });
  });
  it('reports null primary when the gauge has no reading at all', () => {
    expect(agencyView(snap([]), NOW).primary).toBeNull();
  });
  it('flags stale readings and never gives them a colour state', () => {
    const v = agencyView(snap([R({ observedAt: NOW - 3 * HOUR })], undefined, { settings: { ttlMs: {}, agencyMaxAgeMs: HOUR, gaugeThresholds: { 'WL.STN.02': { watch: 0.5, danger: 0.9 } }, origin: { lat: 0, lng: 0 } } as any }), NOW);
    expect(v.primary).toMatchObject({ stale: true, state: 'stale' });
  });
  it('applies committee thresholds to fresh readings', () => {
    const v = agencyView(snap([R({ value: 0.95 })], undefined, { settings: { ttlMs: {}, agencyMaxAgeMs: HOUR, gaugeThresholds: { 'WL.STN.02': { watch: 0.5, danger: 0.9 } }, origin: { lat: 0, lng: 0 } } as any }), NOW);
    expect(v.primary?.state).toBe('danger');
  });
  it('computes the trend from recent samples', () => {
    const recent = [R({ value: 0.5, observedAt: NOW - 60 * MINUTE }), R({ value: 0.6, observedAt: NOW - 30 * MINUTE }), R({ value: 0.72, observedAt: NOW - 5 * MINUTE })];
    expect(agencyView(snap([recent[2]!], recent), NOW).primary?.trend).toBe('rising');
  });
  it('lists other canal gauges and merges rain metrics per station', () => {
    const v = agencyView(snap([
      R({}), R({ stationId: 'WL.STN.01', stationName: 'อีกจุด' }),
      R({ source: 'bma_rain', stationId: 'RF.MBR.03', stationName: 'ฝน', metric: 'rf1hr', value: 27, unit: 'mm' }),
      R({ source: 'bma_rain', stationId: 'RF.MBR.03', stationName: 'ฝน', metric: 'rf24hr', value: 30, unit: 'mm' }),
    ]), NOW);
    expect(v.others.map((g) => g.stationId)).toEqual(['WL.STN.01']);
    expect(v.rain).toEqual([expect.objectContaining({ stationId: 'RF.MBR.03', rf1hr: 27, rf24hr: 30, stale: false })]);
  });
});

describe('visibleWarnings', () => {
  const w = (id: string, hoursAgo: number, bkk: boolean) => ({ id, title: id, body: '', url: '', issuedAt: NOW - hoursAgo * HOUR, mentionsBangkok: bkk });
  it('hides warnings older than 48h and sorts Bangkok mentions first', () => {
    const out = visibleWarnings(snap([], [], { warnings: [w('old', 60, true), w('other', 2, false), w('bkk', 5, true)] }), NOW);
    expect(out.map((x) => x.id)).toEqual(['bkk', 'other']);
  });
});

describe('committeeNote', () => {
  const f = (o: Partial<FeedItem>): FeedItem => ({
    id: Math.random().toString(), kind: 'general', targetId: 'wall', value: 'note', nickname: 'กรรมการ', createdAt: NOW - HOUR, mediaUrl: null, mediaType: null,
    note: 'น้ำเสมอขีด 2', byCommittee: true, confirmedByCommittee: false, confirmations: 0, locationOk: true, ...o,
  });
  it('returns the newest committee note for the target', () => {
    const s = snap([], [], { feed: [f({ createdAt: NOW - 3 * HOUR, note: 'เก่า' }), f({ note: 'ใหม่' }), f({ targetId: 'drainage', note: 'อื่น' })] });
    expect(committeeNote(s, 'wall', NOW)).toEqual({ note: 'ใหม่', createdAt: NOW - HOUR, stale: false });
  });
  it('ignores resident messages and flags notes older than 12h as stale', () => {
    const s = snap([], [], { feed: [f({ byCommittee: false, note: 'ลูกบ้านพิมพ์' }), f({ createdAt: NOW - 13 * HOUR })] });
    expect(committeeNote(s, 'wall', NOW)).toMatchObject({ note: 'น้ำเสมอขีด 2', stale: true });
  });
  it('returns null when nothing was ever posted', () => expect(committeeNote(snap([], [], { feed: [] }), 'drainage', NOW)).toBeNull());
});
```

Run: `npx vitest run src/state/agencyView.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implement the view logic**

```ts
// src/state/agencyView.ts
import { freshness, gaugeState, trend, type GaugeState, type Trend } from '../core/agency';
import { HOUR, PRIMARY_GAUGE, TTL_MS, WARNING_MAX_AGE_MS } from '../core/config';
import type { AgencyReading, Snapshot, WarningRow } from '../data/types';

export interface GaugeView {
  stationId: string; name: string; source: string; value: number; unit: string; observedAt: number; ageMs: number; stale: boolean;
  trend: Trend; state: GaugeState; thresholds: { watch: number; danger: number } | null;
}
export interface RainView { stationId: string; name: string; rf1hr: number | null; rf24hr: number | null; observedAt: number; stale: boolean }

const CANAL_METRICS: Record<string, string> = { bma_canal: 'wl_in', thaiwater: 'waterlevel_msl' };

export function agencyView(s: Snapshot, now: number): { primary: GaugeView | null; others: GaugeView[]; rain: RainView[] } {
  const maxAge = s.settings.agencyMaxAgeMs;
  const gauges: GaugeView[] = s.latest
    .filter((r) => CANAL_METRICS[r.source] === r.metric)
    .map((r) => {
      const { ageMs, stale } = freshness(r.observedAt, now, maxAge);
      const samples = s.recent.filter((x) => x.source === r.source && x.stationId === r.stationId && x.metric === r.metric).map((x) => ({ t: x.observedAt, v: x.value }));
      const thresholds = s.settings.gaugeThresholds[r.stationId] ?? null;
      return { stationId: r.stationId, name: r.stationName, source: r.source, value: r.value, unit: r.unit, observedAt: r.observedAt, ageMs, stale,
        trend: trend(samples, now), state: gaugeState(r.value, thresholds, stale), thresholds };
    });

  const rainRows = s.latest.filter((r) => r.source === 'bma_rain');
  const byStation = new Map<string, AgencyReading[]>();
  for (const r of rainRows) byStation.set(r.stationId, [...(byStation.get(r.stationId) ?? []), r]);
  const rain: RainView[] = [...byStation.entries()].map(([id, rows]) => {
    const newest = Math.max(...rows.map((r) => r.observedAt));
    return {
      stationId: id, name: rows[0]!.stationName,
      rf1hr: rows.find((r) => r.metric === 'rf1hr')?.value ?? null, rf24hr: rows.find((r) => r.metric === 'rf24hr')?.value ?? null,
      observedAt: newest, stale: freshness(newest, now, maxAge).stale,
    };
  });

  return { primary: gauges.find((g) => g.stationId === PRIMARY_GAUGE) ?? null, others: gauges.filter((g) => g.stationId !== PRIMARY_GAUGE), rain };
}

export function visibleWarnings(s: Snapshot, now: number): WarningRow[] {
  return s.warnings.filter((w) => now - w.issuedAt <= WARNING_MAX_AGE_MS)
    .sort((a, b) => Number(b.mentionsBangkok) - Number(a.mentionsBangkok) || b.issuedAt - a.issuedAt);
}

export function committeeNote(s: Snapshot, target: 'wall' | 'drainage', now: number): { note: string; createdAt: number; stale: boolean } | null {
  const newest = s.feed.filter((f) => f.kind === 'general' && f.byCommittee && f.targetId === target).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!newest) return null;
  return { note: newest.note ?? '', createdAt: newest.createdAt, stale: now - newest.createdAt > Math.max(s.settings.ttlMs.supply || TTL_MS.supply, HOUR) };
}
```

Run again → Expected: PASS.

- [ ] **Step 3: Implement the cards and home page**

```tsx
// src/ui/components/GaugeCard.tsx
import { TREND_LABEL_TH } from '../../core/labels';
import type { GaugeView } from '../../state/agencyView';
import { AgeLabel } from './AgeLabel';

const STATE_LABEL: Record<GaugeView['state'], string> = { uncalibrated: '', stale: 'ข้อมูลเก่า', normal: 'ปกติ', watch: 'เฝ้าระวัง', danger: 'อันตราย' };
const STATE_COLOR: Record<GaugeView['state'], string> = { uncalibrated: 'transparent', stale: '#8a8f98', normal: '#1a9850', watch: '#f2a900', danger: '#d73027' };

export function GaugeCard({ g, now, maxAgeMs, big }: { g: GaugeView; now: number; maxAgeMs: number; big?: boolean }) {
  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{g.name}</strong><AgeLabel at={g.observedAt} now={now} maxAgeMs={maxAgeMs} />
      </div>
      <p style={{ margin: '4px 0', fontSize: big ? 32 : 22, fontWeight: 700 }}>
        {g.value.toFixed(2)} <small style={{ fontSize: 14, fontWeight: 400 }}>{g.unit}</small>
        {g.state !== 'uncalibrated' && <span className="badge" style={{ background: STATE_COLOR[g.state], marginLeft: 8 }}>{STATE_LABEL[g.state]}</span>}
      </p>
      <p className="age">{g.stale ? 'ไม่ใช้เป็นข้อมูลปัจจุบัน' : `แนวโน้ม: ${TREND_LABEL_TH[g.trend]}`}
        {g.state === 'uncalibrated' && ' · ค่าดิบจากหน่วยงาน ยังไม่ได้ตั้งเกณฑ์เตือนของหมู่บ้าน'}</p>
    </section>
  );
}
```

```tsx
// src/ui/components/RainCard.tsx
import type { RainView } from '../../state/agencyView';
import { AgeLabel } from './AgeLabel';

export function RainCard({ rain, now, maxAgeMs }: { rain: RainView[]; now: number; maxAgeMs: number }) {
  if (!rain.length) return <section className="card"><strong>ฝน</strong><p className="age">ไม่มีข้อมูลล่าสุดจากสถานีใกล้เคียง</p></section>;
  return (
    <section className="card">
      <strong>ฝนสถานีใกล้เคียง (มม.)</strong>
      <table style={{ width: '100%', fontSize: 14, marginTop: 6 }}>
        <thead><tr><th align="left">สถานี</th><th>1 ชม.</th><th>24 ชม.</th><th align="left">เวลา</th></tr></thead>
        <tbody>{rain.map((r) => (
          <tr key={r.stationId}><td>{r.name}</td><td align="center">{r.rf1hr ?? '–'}</td><td align="center">{r.rf24hr ?? '–'}</td><td><AgeLabel at={r.observedAt} now={now} maxAgeMs={maxAgeMs} /></td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}
```

```tsx
// src/ui/components/WarningList.tsx
import type { WarningRow } from '../../data/types';
import { AgeLabel } from './AgeLabel';

export function WarningList({ warnings, now }: { warnings: WarningRow[]; now: number }) {
  if (!warnings.length) return null;
  return (
    <section>
      <h2>ประกาศจากกรมอุตุนิยมวิทยา</h2>
      {warnings.slice(0, 3).map((w) => (
        <details key={w.id} className="card" open={w.mentionsBangkok}>
          <summary><strong>{w.title}</strong> {w.mentionsBangkok && <span className="badge" style={{ background: '#d73027' }}>กล่าวถึงกรุงเทพฯ</span>} <AgeLabel at={w.issuedAt} now={now} /></summary>
          <p style={{ whiteSpace: 'pre-line' }}>{w.body}</p>
          {w.url && <a href={w.url} target="_blank" rel="noreferrer">ที่มา: กรมอุตุนิยมวิทยา</a>}
        </details>
      ))}
    </section>
  );
}
```

```tsx
// src/ui/pages/HomePage.tsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_LABEL_TH } from '../../core/labels';
import type { SegmentState } from '../../core/types';
import { agencyView, committeeNote, visibleWarnings } from '../../state/agencyView';
import { derive } from '../../state/derive';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from '../components/AgeLabel';
import { FeedItemCard } from '../components/FeedItemCard';
import { GaugeCard } from '../components/GaugeCard';
import { RainCard } from '../components/RainCard';
import { WarningList } from '../components/WarningList';

export function HomePage() {
  const { snapshot: s, now } = useData();
  const snap = s!;
  const a = useMemo(() => agencyView(snap, now), [snap, now]);
  const d = useMemo(() => derive(snap, now), [snap, now]);
  const counts = useMemo(() => {
    const c: Record<SegmentState, number> = { dry: 0, small_car: 0, high_clearance: 0, impassable: 0, unknown: 0 };
    Object.values(d.segmentStates).forEach((r) => { c[r.value]++; });
    return c;
  }, [d]);
  const wall = committeeNote(snap, 'wall', now);
  const drainage = committeeNote(snap, 'drainage', now);
  const maxAge = snap.settings.agencyMaxAgeMs;

  return (
    <div className="page">
      <h1>พอร์ทัลน้ำท่วมหมู่บ้าน</h1>

      <section className="card">
        <strong>กรรมการหมู่บ้านแจ้ง</strong>
        {([['กำแพงริมคลอง', wall], ['การระบายน้ำ', drainage]] as const).map(([label, n]) => (
          <p key={label} style={{ margin: '6px 0' }}>
            <b>{label}:</b> {n ? n.note : 'ยังไม่มีการอัปเดตจากกรรมการ'}{' '}
            {n && <AgeLabel at={n.createdAt} now={now} maxAgeMs={n.stale ? 0 : undefined} />}
          </p>
        ))}
      </section>

      <h2>ระดับน้ำคลอง</h2>
      {a.primary ? <GaugeCard g={a.primary} now={now} maxAgeMs={maxAge} big />
        : <section className="card"><strong>คลองสองต้นนุ่น ซ.ร่มเกล้า 20</strong><p className="age">ไม่มีข้อมูลล่าสุดจากหน่วยงาน</p></section>}
      {a.others.map((g) => <GaugeCard key={g.stationId} g={g} now={now} maxAgeMs={maxAge} />)}
      <RainCard rain={a.rain} now={now} maxAgeMs={maxAge} />
      <WarningList warnings={visibleWarnings(snap, now)} now={now} />

      <h2>สรุปถนน <Link to="/map" style={{ fontSize: 14 }}>ดูแผนที่</Link></h2>
      <p>{(Object.keys(counts) as SegmentState[]).filter((k) => counts[k]).map((k) => `${STATUS_LABEL_TH[k]} ${counts[k]}`).join(' · ') || 'ยังไม่มีช่วงถนนในระบบ'}</p>

      <h2>รายงานล่าสุด</h2>
      {snap.feed.length === 0 && <p>ยังไม่มีรายงานใน 7 วันที่ผ่านมา</p>}
      {snap.feed.slice(0, 20).map((f) => <FeedItemCard key={f.id} item={f} snapshot={snap} now={now} />)}
    </div>
  );
}
```

In `src/ui/App.tsx` replace the temporary index route element with `<HomePage />` (add the import).

- [ ] **Step 4: Run tests and verify with live data**

Run: `npx vitest run && npx tsc --noEmit` → Expected: all pass.

With the poller data from Task 7 loaded, open `/` in the browser. Expected: a gauge card "ค.สองต้นน่น ซ.ร่มเกล้า 20" with a value, an age such as "อัปเดต 8 นาทีที่แล้ว", the text "ค่าดิบจากหน่วยงาน ยังไม่ได้ตั้งเกณฑ์เตือนของหมู่บ้าน", **no coloured badge**; a rain table; TMD warnings if any are within 48 h. To check the stale path, run `supabase db query "update agency_readings set observed_at = observed_at - interval '3 hours'"` and reload: the card must show "ข้อมูลเก่า · …" and "ไม่ใช้เป็นข้อมูลปัจจุบัน".

```bash
git add -A && git commit -m "feat(home): agency gauges/rain/warnings with staleness, committee notes, recent reports"
```

---

### Task 13: Routes page (curated routes to the city, per vehicle class)

**Files:**
- Create: `src/state/routeViews.ts`, `src/ui/pages/RoutesPage.tsx`
- Modify: `src/ui/App.tsx` (add route `/routes`)
- Test: `src/state/routeViews.test.ts`

**Interfaces:**
- Consumes: `routeStatus`, `rankRoutes`, `RouteDef`, `RouteStatus`, `buildGoogleMapsUrl`; `derive`; `routeLine`; `Snapshot`, `DestinationRow`.
- Produces: `interface RouteView { route: RouteDef; status: RouteStatus; destination: DestinationRow | undefined; blockedNames: string[]; unknownNames: string[] }`; `routeViews(s: Snapshot, now: number, vehicle: VehicleClass, destinationId: string | null): RouteView[]` (ranked; `destinationId = null` → all); `recommended(views: RouteView[]): RouteView | null` (first view whose state is `ok`, else `null`)

- [ ] **Step 1: Write the failing test**

```ts
// src/state/routeViews.test.ts
import { routeViews, recommended } from './routeViews';
import type { Snapshot } from '../data/types';
import type { Report } from '../core/types';
import { HOUR } from '../core/config';

const NOW = 1_000_000_000_000;
const rep = (targetId: string, value: string): Report => ({
  id: targetId + value, kind: 'road', targetId, value, createdAt: NOW - 60_000, hasEvidence: true, locationOk: true, byCommittee: false, confirmedByCommittee: false,
});
const seg = (id: string, name: string) => ({ id, name, geojson: { type: 'LineString', coordinates: [] } });
const base = {
  segments: [seg('a', 'ซอย A'), seg('b', 'ถนน B'), seg('c', 'ถนน C')],
  destinations: [{ id: 'd1', name: 'เมือง', kind: 'city', lat: 1, lng: 2 }, { id: 'd2', name: 'ตลาด', kind: 'market', lat: 3, lng: 4 }],
  routes: [
    { id: 'r1', name: 'ผ่าน B', destinationId: 'd1', segmentIds: ['a', 'b'], waypoints: [], distanceM: 5000 },
    { id: 'r2', name: 'ผ่าน C', destinationId: 'd1', segmentIds: ['a', 'c'], waypoints: [], distanceM: 7000 },
    { id: 'r3', name: 'ไปตลาด', destinationId: 'd2', segmentIds: ['a'], waypoints: [], distanceM: 1000 },
  ],
  settings: { ttlMs: { road: 3 * HOUR, water_level: HOUR, supply: HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 0, lng: 0 } },
  marks: [], places: [],
};
const snap = (reports: Report[]) => ({ ...base, reports } as unknown as Snapshot);

it('ranks the open route first and names the blocked/unknown segments', () => {
  const v = routeViews(snap([rep('a', 'dry'), rep('b', 'impassable'), rep('c', 'dry')]), NOW, 'small_car', 'd1');
  expect(v.map((x) => x.route.id)).toEqual(['r2', 'r1']);
  expect(v[1]!.blockedNames).toEqual(['ถนน B']);
  expect(recommended(v)?.route.id).toBe('r2');
});
it('differs by vehicle class', () => {
  const s = snap([rep('a', 'dry'), rep('b', 'high_clearance'), rep('c', 'impassable')]);
  expect(recommended(routeViews(s, NOW, 'small_car', 'd1'))).toBeNull();
  expect(recommended(routeViews(s, NOW, 'high_clearance', 'd1'))?.route.id).toBe('r1');
});
it('never recommends a route with an unknown segment', () => {
  const v = routeViews(snap([rep('a', 'dry')]), NOW, 'small_car', 'd1');
  expect(v.every((x) => x.status.state === 'unknown')).toBe(true);
  expect(recommended(v)).toBeNull();
  expect(v[0]!.unknownNames.length).toBeGreaterThan(0);
});
it('filters by destination, or returns all when null', () => {
  const s = snap([rep('a', 'dry')]);
  expect(routeViews(s, NOW, 'small_car', 'd2').map((x) => x.route.id)).toEqual(['r3']);
  expect(routeViews(s, NOW, 'small_car', null)).toHaveLength(3);
});
```

Run: `npx vitest run src/state/routeViews.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// src/state/routeViews.ts
import { rankRoutes, routeStatus, type RouteDef, type RouteStatus } from '../core/routes';
import type { VehicleClass } from '../core/types';
import type { DestinationRow, Snapshot } from '../data/types';
import { derive } from './derive';

export interface RouteView { route: RouteDef; status: RouteStatus; destination: DestinationRow | undefined; blockedNames: string[]; unknownNames: string[] }

export function routeViews(s: Snapshot, now: number, vehicle: VehicleClass, destinationId: string | null): RouteView[] {
  const { segmentStates } = derive(s, now);
  const name = (id: string) => s.segments.find((x) => x.id === id)?.name ?? id;
  const items = s.routes
    .filter((r) => destinationId === null || r.destinationId === destinationId)
    .map((route) => {
      const status = routeStatus(route, segmentStates, vehicle);
      return { route, status, destination: s.destinations.find((d) => d.id === route.destinationId),
        blockedNames: status.blockedSegmentIds.map(name), unknownNames: status.unknownSegmentIds.map(name) };
    });
  return rankRoutes(items);
}

export const recommended = (views: RouteView[]): RouteView | null => views.find((v) => v.status.state === 'ok') ?? null;
```

Run again → Expected: PASS.

- [ ] **Step 3: Implement the routes page**

```tsx
// src/ui/pages/RoutesPage.tsx
import { useMemo, useState } from 'react';
import { buildGoogleMapsUrl } from '../../core/routes';
import { VEHICLE_LABEL_TH } from '../../core/labels';
import type { VehicleClass } from '../../core/types';
import { derive } from '../../state/derive';
import { recommended, routeViews, type RouteView } from '../../state/routeViews';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from '../components/AgeLabel';
import { Legend } from '../components/Legend';
import { routeLine } from '../map/geojson';
import { MapView } from '../map/MapView';

const VEHICLE_KEY = 'flood.vehicle';
const loadVehicle = (): VehicleClass => { try { return localStorage.getItem(VEHICLE_KEY) === 'high_clearance' ? 'high_clearance' : 'small_car'; } catch { return 'small_car'; } };

const STATE_TEXT = { ok: 'ไปได้ (ตามรายงานล่าสุด)', unknown: 'ไม่ทราบ — ยังไม่มีข้อมูลบางช่วง', blocked: 'ไปไม่ได้' } as const;
const STATE_COLOR = { ok: '#1a9850', unknown: '#8a8f98', blocked: '#d73027' } as const;

export function RoutesPage() {
  const { snapshot: s, now } = useData();
  const snap = s!;
  const [vehicle, setVehicle] = useState<VehicleClass>(loadVehicle);
  const [dest, setDest] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const views = useMemo(() => routeViews(snap, now, vehicle, dest), [snap, now, vehicle, dest]);
  const best = recommended(views);
  const d = useMemo(() => derive(snap, now), [snap, now]);
  const chooseVehicle = (v: VehicleClass) => { setVehicle(v); try { localStorage.setItem(VEHICLE_KEY, v); } catch { /* ignore */ } };

  const card = (v: RouteView) => (
    <article key={v.route.id} className="card" style={{ borderLeft: `6px solid ${STATE_COLOR[v.status.state]}` }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>{v.route.name}{best?.route.id === v.route.id ? ' ★ แนะนำ' : ''}</strong>
        <span>{(v.route.distanceM / 1000).toFixed(1)} กม.</span>
      </header>
      <p style={{ margin: '4px 0', fontWeight: 700 }}>{v.destination?.name} · {STATE_TEXT[v.status.state]} สำหรับ{VEHICLE_LABEL_TH[vehicle]}{v.status.hasConflict && ' · มีรายงานขัดแย้ง'}</p>
      {v.blockedNames.length > 0 && <p className="conflict">ติดที่: {v.blockedNames.join(', ')}</p>}
      {v.unknownNames.length > 0 && <p className="age">ไม่มีข้อมูล: {v.unknownNames.join(', ')} (ห้ามถือว่าผ่านได้)</p>}
      <p className="age">ช่วงที่เก่าที่สุดในเส้นนี้: <AgeLabel at={v.status.oldestAsOf} now={now} /></p>
      <button type="button" className="secondary" onClick={() => setOpen(open === v.route.id ? null : v.route.id)}>{open === v.route.id ? 'ซ่อนแผนที่' : 'ดูบนแผนที่'}</button>
      {open === v.route.id && v.destination && (
        <div style={{ marginTop: 8 }}>
          <MapView segments={snap.segments} states={d.segmentStates} highlightIds={v.route.segmentIds} center={snap.settings.origin} zoom={13} height="45dvh" />
          <Legend />
          <p className="age">Google Maps อาจพาไปทางอื่นที่ไม่ใช่เส้นนี้ — ดูเส้นบนแผนที่ด้านบนประกอบเสมอ</p>
          <a className="btn" href={buildGoogleMapsUrl({ origin: snap.settings.origin, destination: { lat: v.destination.lat, lng: v.destination.lng }, waypoints: v.route.waypoints })} target="_blank" rel="noreferrer">เปิดนำทางใน Google Maps</a>
        </div>
      )}
    </article>
  );

  return (
    <div className="page">
      <h1>เส้นทางออกจากหมู่บ้าน</h1>
      <div role="group" aria-label="ประเภทรถ" style={{ display: 'flex', gap: 8 }}>
        {(['small_car', 'high_clearance'] as const).map((v) => (
          <button key={v} type="button" className={vehicle === v ? '' : 'secondary'} onClick={() => chooseVehicle(v)}>{VEHICLE_LABEL_TH[v]}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
        <button type="button" className={dest === null ? '' : 'secondary'} onClick={() => setDest(null)}>ทั้งหมด</button>
        {snap.destinations.map((x) => <button key={x.id} type="button" className={dest === x.id ? '' : 'secondary'} onClick={() => setDest(x.id)}>{x.name}</button>)}
      </div>
      {!best && views.length > 0 && <div className="banner banner--warn">ขณะนี้ยังไม่มีเส้นทางที่ยืนยันได้ว่าไปได้สำหรับ{VEHICLE_LABEL_TH[vehicle]} — โปรดรายงานสภาพถนนช่วยกัน</div>}
      {views.length === 0 && <p>ยังไม่มีเส้นทางในระบบ</p>}
      {views.map(card)}
    </div>
  );
}
```

In `src/ui/App.tsx` add `import { RoutesPage } from './pages/RoutesPage';` and `<Route path="routes" element={<RoutesPage />} />`.

- [ ] **Step 4: Run tests and verify in the browser**

Run: `npx vitest run && npx tsc --noEmit` → Expected: all pass.

With the demo seed: open `/routes`. Expected: the demo route shows "ไม่ทราบ — ยังไม่มีข้อมูลบางช่วง" with both segments listed under "ไม่มีข้อมูล" and **no ★**. Report `dry` with a photo for both demo segments near their coordinates (or use SQL `update reports set location_ok = true`) → the route turns green with ★ for both vehicle classes; report `high_clearance` on one segment → green for ยกสูง, red "ไปไม่ได้" for รถเล็ก. Tap "ดูบนแผนที่": the map highlights the route and the Google Maps button opens a URL with `origin=`, `destination=` (check by long-pressing the link).

```bash
git add -A && git commit -m "feat(routes): ranked curated routes per vehicle class with Google Maps hand-off"
```

---

### Task 14: Supply points page and candidate-places script

**Files:**
- Create: `src/state/supplyViews.ts`, `src/ui/pages/SupplyPage.tsx`, `scripts/fetch-places.mjs`
- Modify: `src/ui/App.tsx` (add route `/supply`)
- Test: `src/state/supplyViews.test.ts`

**Interfaces:**
- Consumes: `derive`, `haversineM`, `buildGoogleMapsSearchUrl`, `SUPPLY_LABEL_TH`, `PlaceRow`, `PlaceCategory`.
- Produces: `interface SupplyView { place: PlaceRow; status: Resolved<SupplyStatus>; distanceM: number }`; `supplyViews(s: Snapshot, now: number, category: PlaceCategory | null): SupplyView[]` (open first, then out_of_stock, closed, unreachable, unknown last; ties by distance from `settings.origin`); `CATEGORY_LABEL_TH: Record<PlaceCategory, string>`

- [ ] **Step 1: Write the failing test**

```ts
// src/state/supplyViews.test.ts
import { supplyViews } from './supplyViews';
import type { Snapshot } from '../data/types';
import type { Report } from '../core/types';
import { HOUR } from '../core/config';

const NOW = 1_000_000_000_000;
const rep = (targetId: string, value: string, ago = 60_000): Report => ({
  id: targetId + value, kind: 'supply', targetId, value, createdAt: NOW - ago, hasEvidence: false, locationOk: true, byCommittee: false, confirmedByCommittee: false,
});
const place = (id: string, category: string, lng: number) => ({ id, name: id, category, geojson: { type: 'Point', coordinates: [lng, 13.0] } });
const snap = (reports: Report[]) => ({
  places: [place('far-open', 'store', 100.5), place('near-open', 'store', 100.01), place('closed', 'store', 100.02), place('unk', 'store', 100.0), place('food', 'food', 100.0)],
  reports, segments: [], marks: [],
  settings: { ttlMs: { road: HOUR, water_level: HOUR, supply: 12 * HOUR }, agencyMaxAgeMs: HOUR, gaugeThresholds: {}, origin: { lat: 13.0, lng: 100.0 } },
} as unknown as Snapshot);

it('orders open first (nearest first), closed after, unknown last', () => {
  const v = supplyViews(snap([rep('far-open', 'open'), rep('near-open', 'open'), rep('closed', 'closed')]), NOW, 'store');
  expect(v.map((x) => x.place.id)).toEqual(['near-open', 'far-open', 'closed', 'unk']);
});
it('shows a place as unknown once its report is older than 12h', () => {
  const v = supplyViews(snap([rep('near-open', 'open', 13 * HOUR)]), NOW, 'store');
  expect(v.find((x) => x.place.id === 'near-open')?.status.value).toBe('unknown');
});
it('filters by category', () => {
  expect(supplyViews(snap([]), NOW, 'food').map((x) => x.place.id)).toEqual(['food']);
});
```

Run: `npx vitest run src/state/supplyViews.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// src/state/supplyViews.ts
import { haversineM } from '../core/geo';
import type { Resolved, SupplyStatus } from '../core/types';
import type { PlaceCategory, PlaceRow, Snapshot } from '../data/types';
import { derive } from './derive';

export interface SupplyView { place: PlaceRow; status: Resolved<SupplyStatus>; distanceM: number }
export const CATEGORY_LABEL_TH: Record<PlaceCategory, string> = { food: 'ร้านอาหาร', market: 'ตลาด', store: 'ร้านสะดวกซื้อ/ซูเปอร์', fuel: 'ปั๊มน้ำมัน', hospital: 'โรงพยาบาล/คลินิก' };

const ORDER: Record<SupplyStatus | 'unknown', number> = { open: 0, out_of_stock: 1, closed: 2, unreachable: 3, unknown: 4 };

export function supplyViews(s: Snapshot, now: number, category: PlaceCategory | null): SupplyView[] {
  const { placeStates } = derive(s, now);
  return s.places
    .filter((p) => category === null || p.category === category)
    .map((place) => ({
      place, status: placeStates[place.id]!,
      distanceM: haversineM(s.settings.origin, { lat: place.geojson.coordinates[1]!, lng: place.geojson.coordinates[0]! }),
    }))
    .sort((a, b) => ORDER[a.status.value] - ORDER[b.status.value] || a.distanceM - b.distanceM);
}
```

Run again → Expected: PASS.

- [ ] **Step 3: Implement the supply page and the Overpass candidate script**

```tsx
// src/ui/pages/SupplyPage.tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildGoogleMapsSearchUrl } from '../../core/routes';
import { SUPPLY_LABEL_TH } from '../../core/labels';
import type { PlaceCategory } from '../../data/types';
import { CATEGORY_LABEL_TH, supplyViews } from '../../state/supplyViews';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from '../components/AgeLabel';

const COLOR = { open: '#1a9850', out_of_stock: '#f2a900', closed: '#d73027', unreachable: '#d73027', unknown: '#8a8f98' } as const;

export function SupplyPage() {
  const { snapshot: s, now } = useData();
  const snap = s!;
  const [cat, setCat] = useState<PlaceCategory | null>(null);
  const views = useMemo(() => supplyViews(snap, now, cat), [snap, now, cat]);
  return (
    <div className="page">
      <h1>จุดซื้อเสบียง</h1>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        <button type="button" className={cat === null ? '' : 'secondary'} onClick={() => setCat(null)}>ทั้งหมด</button>
        {(Object.keys(CATEGORY_LABEL_TH) as PlaceCategory[]).map((c) => <button key={c} type="button" className={cat === c ? '' : 'secondary'} onClick={() => setCat(c)}>{CATEGORY_LABEL_TH[c]}</button>)}
      </div>
      {views.length === 0 && <p>ยังไม่มีจุดในหมวดนี้</p>}
      {views.map(({ place, status, distanceM }) => (
        <article key={place.id} className="card">
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{place.name}</strong><span>{(distanceM / 1000).toFixed(1)} กม.</span>
          </header>
          <p style={{ margin: '4px 0' }}>
            <span className="badge" style={{ background: COLOR[status.value] }}>{SUPPLY_LABEL_TH[status.value]}</span> <AgeLabel at={status.asOf} now={now} />
          </p>
          {status.value === 'unknown' && <p className="age">ยังไม่มีรายงานล่าสุด — โทรหรือสอบถามก่อนเดินทาง</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn" to={`/report?kind=supply&target=${place.id}`}>รายงานสถานะ</Link>
            <a className="btn secondary" style={{ background: '#fff', color: 'var(--brand)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              href={buildGoogleMapsSearchUrl({ lat: place.geojson.coordinates[1]!, lng: place.geojson.coordinates[0]! })} target="_blank" rel="noreferrer">เปิดแผนที่</a>
          </div>
        </article>
      ))}
    </div>
  );
}
```

```js
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

const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'user-agent': 'village-flood-portal/1.0' } });
if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
const { elements } = await res.json();

const places = elements
  .map((e) => ({ e, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }))
  .filter(({ e, lat, lng }) => e.tags?.name && lat && lng)
  .map(({ e, lat, lng }) => ({ id: `osm-${e.type}-${e.id}`, name: e.tags.name, category: category(e.tags), geojson: { type: 'Point', coordinates: [lng, lat] } }));

await mkdir('data', { recursive: true });
await writeFile('data/places.candidates.json', JSON.stringify(places, null, 2));
console.log(`${places.length} candidates written to data/places.candidates.json — review with the committee, delete what you don't want, then load with scripts/import-geo.mjs`);
```

In `src/ui/App.tsx` add `import { SupplyPage } from './pages/SupplyPage';` and `<Route path="supply" element={<SupplyPage />} />`.

- [ ] **Step 4: Run, try the script, commit**

Run: `npx vitest run && npx tsc --noEmit` → Expected: all pass.
Run: `node scripts/fetch-places.mjs` → Expected: `N candidates written…` with N > 0 (if Overpass times out, retry later; record the count). Open `data/places.candidates.json` and sanity-check a few names and coordinates against a map.

```bash
echo "data/" >> .gitignore
git add -A && git commit -m "feat(supply): supply points page with status/age ordering and Overpass candidate script"
```

---

### Task 15: Committee admin (login, moderation, notes, settings, content import)

**Files:**
- Create: `src/core/validateContent.ts`, `src/ui/pages/AdminPage.tsx`, `src/ui/components/admin/{AuthGate,ModerationList,CommitteeNoteForm,SettingsForm,ContentEditor}.tsx`, `src/state/useCommittee.ts`, `scripts/import-geo.mjs`
- Modify: `src/ui/App.tsx` (add route `/admin`)
- Test: `src/core/validateContent.test.ts`

**Interfaces:**
- Consumes: `supabase`, `submit_report`/`moderate_report` RPCs, tables `reports` (committee select policy), `devices`, `settings`, content tables with committee write policies, `GOOGLE_MAPS_MAX_WAYPOINTS`, `VILLAGE_CENTER`, `haversineM`.
- Produces (`validateContent.ts`): `validateSegmentGeoJSON(g: unknown): string[]`; `validatePointGeoJSON(g: unknown): string[]`; `validateRouteInput(r: { segmentIds: string[]; waypoints: LatLng[]; distanceM: number }, knownSegmentIds: string[]): string[]`; `validateWaterLevels(levels: unknown): string[]` (Thai messages; empty = valid)
- Produces: `useCommittee(): { loading: boolean; email: string | null; isCommittee: boolean; signIn(email: string): Promise<void>; signOut(): Promise<void> }`; route `/admin`.

- [ ] **Step 1: Write the failing validation tests**

```ts
// src/core/validateContent.test.ts
import { validateSegmentGeoJSON, validatePointGeoJSON, validateRouteInput, validateWaterLevels } from './validateContent';

describe('validateSegmentGeoJSON', () => {
  it('accepts a LineString near the village', () =>
    expect(validateSegmentGeoJSON({ type: 'LineString', coordinates: [[100.738, 13.777], [100.74, 13.778]] })).toEqual([]));
  it('rejects non-LineStrings and short lines', () => {
    expect(validateSegmentGeoJSON({ type: 'Point', coordinates: [100, 13] })).toContain('ต้องเป็น LineString');
    expect(validateSegmentGeoJSON({ type: 'LineString', coordinates: [[100.738, 13.777]] })).toContain('ต้องมีอย่างน้อย 2 จุด');
  });
  it('catches swapped lat/lng or far-away coordinates', () => {
    expect(validateSegmentGeoJSON({ type: 'LineString', coordinates: [[13.777, 100.738], [13.778, 100.74]] }).join()).toContain('ไกลจากหมู่บ้าน');
  });
});
describe('validatePointGeoJSON', () => {
  it('accepts a nearby point, rejects others', () => {
    expect(validatePointGeoJSON({ type: 'Point', coordinates: [100.74, 13.78] })).toEqual([]);
    expect(validatePointGeoJSON({ type: 'LineString', coordinates: [] })).toContain('ต้องเป็น Point');
  });
});
describe('validateRouteInput', () => {
  const ok = { segmentIds: ['a', 'b'], waypoints: [{ lat: 13.7, lng: 100.7 }], distanceM: 5000 };
  it('accepts a valid route', () => expect(validateRouteInput(ok, ['a', 'b'])).toEqual([]));
  it('rejects unknown segments, too many waypoints, empty and zero-length routes', () => {
    expect(validateRouteInput(ok, ['a'])).toContain('ไม่พบช่วงถนน: b');
    expect(validateRouteInput({ ...ok, waypoints: Array(4).fill({ lat: 13.7, lng: 100.7 }) }, ['a', 'b'])).toContain('จุดแวะได้ไม่เกิน 3 จุด');
    expect(validateRouteInput({ ...ok, segmentIds: [] }, ['a'])).toContain('ต้องมีอย่างน้อย 1 ช่วงถนน');
    expect(validateRouteInput({ ...ok, distanceM: 0 }, ['a', 'b'])).toContain('ระยะทางต้องมากกว่า 0');
  });
});
describe('validateWaterLevels', () => {
  it('accepts numbered levels with labels', () => expect(validateWaterLevels([{ level: 1, label: 'ขีด 1' }, { level: 2, label: 'ขีด 2' }])).toEqual([]));
  it('rejects empty, duplicate, or unlabeled levels', () => {
    expect(validateWaterLevels([])).toContain('ต้องมีอย่างน้อย 1 ระดับ');
    expect(validateWaterLevels([{ level: 1, label: 'a' }, { level: 1, label: 'b' }])).toContain('หมายเลขระดับซ้ำกัน');
    expect(validateWaterLevels([{ level: 1, label: '' }])).toContain('ทุกระดับต้องมีชื่อ');
  });
});
```

Run: `npx vitest run src/core/validateContent.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implement validation**

```ts
// src/core/validateContent.ts
import { GOOGLE_MAPS_MAX_WAYPOINTS, VILLAGE_CENTER } from './config';
import { haversineM } from './geo';
import type { LatLng } from './types';

const MAX_FROM_VILLAGE_M = 30_000;
const near = (lng: number, lat: number) => haversineM(VILLAGE_CENTER, { lat, lng }) <= MAX_FROM_VILLAGE_M;
const isPos = (c: unknown): c is [number, number] => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number';

export function validateSegmentGeoJSON(g: any): string[] {
  const errs: string[] = [];
  if (g?.type !== 'LineString') return ['ต้องเป็น LineString'];
  if (!Array.isArray(g.coordinates) || g.coordinates.length < 2) errs.push('ต้องมีอย่างน้อย 2 จุด');
  else if (!g.coordinates.every(isPos)) errs.push('พิกัดไม่ถูกต้อง');
  else if (g.coordinates.some(([lng, lat]: [number, number]) => !near(lng, lat))) errs.push('มีพิกัดที่ไกลจากหมู่บ้านเกิน 30 กม. (ตรวจว่าไม่ได้สลับ lat/lng — GeoJSON เรียงเป็น [lng, lat])');
  return errs;
}

export function validatePointGeoJSON(g: any): string[] {
  if (g?.type !== 'Point') return ['ต้องเป็น Point'];
  if (!isPos(g.coordinates)) return ['พิกัดไม่ถูกต้อง'];
  return near(g.coordinates[0], g.coordinates[1]) ? [] : ['พิกัดอยู่ไกลจากหมู่บ้านเกิน 30 กม. (GeoJSON เรียงเป็น [lng, lat])'];
}

export function validateRouteInput(r: { segmentIds: string[]; waypoints: LatLng[]; distanceM: number }, known: string[]): string[] {
  const errs: string[] = [];
  if (r.segmentIds.length === 0) errs.push('ต้องมีอย่างน้อย 1 ช่วงถนน');
  const missing = r.segmentIds.filter((id) => !known.includes(id));
  if (missing.length) errs.push(`ไม่พบช่วงถนน: ${missing.join(', ')}`);
  if (r.waypoints.length > GOOGLE_MAPS_MAX_WAYPOINTS) errs.push(`จุดแวะได้ไม่เกิน ${GOOGLE_MAPS_MAX_WAYPOINTS} จุด`);
  if (!(r.distanceM > 0)) errs.push('ระยะทางต้องมากกว่า 0');
  return errs;
}

export function validateWaterLevels(levels: any): string[] {
  if (!Array.isArray(levels) || levels.length === 0) return ['ต้องมีอย่างน้อย 1 ระดับ'];
  const errs: string[] = [];
  const nums = levels.map((l) => l?.level);
  if (new Set(nums).size !== nums.length) errs.push('หมายเลขระดับซ้ำกัน');
  if (!nums.every((n) => Number.isInteger(n) && n > 0)) errs.push('หมายเลขระดับต้องเป็นจำนวนเต็มบวก');
  if (!levels.every((l) => typeof l?.label === 'string' && l.label.trim())) errs.push('ทุกระดับต้องมีชื่อ');
  return errs;
}
```

Run again → Expected: PASS.

- [ ] **Step 3: Add committee members (documented manual step) and auth hook**

Committee accounts use Supabase Auth email magic links. In the Supabase dashboard (Authentication → URL Configuration) add the site URL(s) (`http://localhost:5173` for dev, the production URL later). After a committee member signs in once, grant access:

```sql
insert into committee_members (user_id)
select id from auth.users where email in ('chair@example.com', 'secretary@example.com');
```

```ts
// src/state/useCommittee.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../data/supabase';

export function useCommittee() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [isCommittee, setIsCommittee] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    setEmail(user?.email ?? null);
    if (user) {
      const { data: rows } = await supabase.from('committee_members').select('user_id').eq('user_id', user.id);
      setIsCommittee((rows?.length ?? 0) > 0);
    } else setIsCommittee(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { refresh(); });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  return {
    loading, email, isCommittee,
    signIn: async (addr: string) => { const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: `${location.origin}/admin` } }); if (error) throw error; },
    signOut: async () => { await supabase.auth.signOut(); },
  };
}
```

- [ ] **Step 4: Implement the admin components**

```tsx
// src/ui/components/admin/AuthGate.tsx
import { useState, type ReactNode } from 'react';
import { useCommittee } from '../../../state/useCommittee';

export function AuthGate({ children }: { children: (c: ReturnType<typeof useCommittee>) => ReactNode }) {
  const c = useCommittee();
  const [addr, setAddr] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  if (c.loading) return <p>กำลังตรวจสอบ…</p>;
  if (!c.email) {
    return (
      <div className="card">
        <p>สำหรับกรรมการหมู่บ้าน — กรอกอีเมลเพื่อรับลิงก์เข้าสู่ระบบ</p>
        <input type="email" value={addr} onChange={(e) => setAddr(e.target.value)} style={{ width: '100%', minHeight: 44 }} />
        <button type="button" onClick={async () => { try { await c.signIn(addr); setSent(true); } catch (e) { setErr((e as Error).message); } }}>ส่งลิงก์</button>
        {sent && <p>ส่งลิงก์ไปที่อีเมลแล้ว</p>}{err && <p className="conflict">{err}</p>}
      </div>
    );
  }
  if (!c.isCommittee) return <div className="card"><p>บัญชี {c.email} ยังไม่ได้รับสิทธิ์กรรมการ</p><button type="button" className="secondary" onClick={c.signOut}>ออกจากระบบ</button></div>;
  return <>{children(c)}</>;
}
```

```tsx
// src/ui/components/admin/ModerationList.tsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../data/supabase';
import { mediaUrl } from '../../../data/supabase';
import { AgeLabel } from '../AgeLabel';

interface Row { id: string; kind: string; target_id: string; value: string; nickname: string; device_id: string; created_at: string; location_ok: boolean; media_path: string | null; note: string | null; confirmed_by_committee: boolean; by_committee: boolean; deleted: boolean }

export function ModerationList({ now }: { now: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    const { data } = await supabase.from('reports').select('*').eq('deleted', false).order('created_at', { ascending: false }).limit(100);
    setRows((data ?? []) as Row[]);
    const { data: devs } = await supabase.from('devices').select('id').eq('blocked', true);
    setBlocked(new Set((devs ?? []).map((d) => d.id)));
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, action: 'confirm' | 'delete') => { await supabase.rpc('moderate_report', { p_report: id, p_action: action }); load(); };
  const block = async (device: string, value: boolean) => { await supabase.from('devices').update({ blocked: value }).eq('id', device); load(); };

  return (
    <section>
      <h2>รายงานล่าสุด (ตรวจสอบ/ลบ/ยืนยัน)</h2>
      {rows.map((r) => (
        <article key={r.id} className="card" style={{ borderLeft: r.location_ok || r.confirmed_by_committee ? undefined : '6px solid #d73027' }}>
          <strong>{r.kind} · {r.target_id} · {r.value}</strong> <AgeLabel at={Date.parse(r.created_at)} now={now} />
          <p style={{ margin: '4px 0' }}>{r.nickname}{r.note ? ` — ${r.note}` : ''}{!r.location_ok && !r.confirmed_by_committee && !r.by_committee ? ' · ตำแหน่งไม่ตรง (ยังไม่มีผลต่อสถานะ)' : ''}</p>
          {r.media_path && <a href={mediaUrl(r.media_path)} target="_blank" rel="noreferrer">ดูหลักฐาน</a>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {!r.confirmed_by_committee && !r.by_committee && <button type="button" onClick={() => act(r.id, 'confirm')}>ยืนยัน</button>}
            <button type="button" className="secondary" onClick={() => act(r.id, 'delete')}>ลบ</button>
            <button type="button" className="secondary" onClick={() => block(r.device_id, !blocked.has(r.device_id))}>{blocked.has(r.device_id) ? 'ปลดบล็อกเครื่อง' : 'บล็อกเครื่อง'}</button>
          </div>
        </article>
      ))}
    </section>
  );
}
```

```tsx
// src/ui/components/admin/CommitteeNoteForm.tsx
import { useState } from 'react';
import { getDeviceId } from '../../../data/device';
import { supabase } from '../../../data/supabase';

export function CommitteeNoteForm({ nickname, onDone }: { nickname: string; onDone: () => void }) {
  const [target, setTarget] = useState<'wall' | 'drainage'>('wall');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const send = async () => {
    const { error } = await supabase.rpc('submit_report', {
      p_device: getDeviceId(), p_nickname: nickname || 'กรรมการ', p_kind: 'general', p_target: target, p_value: 'note',
      p_lat: null, p_lng: null, p_media_path: null, p_media_type: null, p_note: note,
    });
    setMsg(error ? `ไม่สำเร็จ: ${error.message}` : 'บันทึกแล้ว'); if (!error) { setNote(''); onDone(); }
  };
  return (
    <section className="card">
      <h2>อัปเดตกำแพง/การระบายน้ำ</h2>
      <select value={target} onChange={(e) => setTarget(e.target.value as 'wall' | 'drainage')} style={{ minHeight: 44 }}>
        <option value="wall">กำแพงริมคลอง</option><option value="drainage">การระบายน้ำ/เครื่องสูบ</option>
      </select>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ width: '100%' }} placeholder="เช่น น้ำเสมอขีดที่ 2 กำลังสูบน้ำออก" />
      <button type="button" disabled={!note.trim()} onClick={send}>บันทึก</button> {msg}
      <p className="age">การแก้ทับสถานะถนนของกรรมการ: ส่งรายงานปกติที่หน้า "รายงาน" ขณะล็อกอินอยู่ ระบบจะติดป้าย "กรรมการ" ให้เอง (ยังต้องแนบรูปถ้าเป็นสถานะ "ไปได้")</p>
    </section>
  );
}
```

```tsx
// src/ui/components/admin/SettingsForm.tsx
import { useState } from 'react';
import { HOUR } from '../../../core/config';
import { supabase } from '../../../data/supabase';
import type { Snapshot } from '../../../data/types';

export function SettingsForm({ snapshot, onDone }: { snapshot: Snapshot; onDone: () => void }) {
  const s = snapshot.settings;
  const [road, setRoad] = useState(s.ttlMs.road / HOUR);
  const [water, setWater] = useState(s.ttlMs.water_level / HOUR);
  const [supply, setSupply] = useState(s.ttlMs.supply / HOUR);
  const [agency, setAgency] = useState(s.agencyMaxAgeMs / 60_000);
  const [watch, setWatch] = useState(String(s.gaugeThresholds['WL.STN.02']?.watch ?? ''));
  const [danger, setDanger] = useState(String(s.gaugeThresholds['WL.STN.02']?.danger ?? ''));
  const [origin, setOrigin] = useState(`${s.origin.lat}, ${s.origin.lng}`);
  const [msg, setMsg] = useState('');

  const save = async () => {
    const [lat, lng] = origin.split(',').map((x) => Number(x.trim()));
    const th = { ...s.gaugeThresholds };
    if (watch !== '' && danger !== '' && Number(watch) < Number(danger)) th['WL.STN.02'] = { watch: Number(watch), danger: Number(danger) }; else delete th['WL.STN.02'];
    const rows = [
      { key: 'ttl_ms', value: { road: road * HOUR, water_level: water * HOUR, supply: supply * HOUR } },
      { key: 'agency_max_age_ms', value: agency * 60_000 },
      { key: 'gauge_thresholds', value: th },
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? [{ key: 'origin', value: { lat, lng } }] : []),
    ];
    const { error } = await supabase.from('settings').upsert(rows);
    setMsg(error ? `ไม่สำเร็จ: ${error.message}` : 'บันทึกแล้ว'); if (!error) onDone();
  };
  const num = (v: number, set: (n: number) => void, label: string) => (
    <label style={{ display: 'block' }}>{label} <input type="number" min={0.25} step={0.25} value={v} onChange={(e) => set(Number(e.target.value))} /></label>
  );
  return (
    <section className="card">
      <h2>ตั้งค่า</h2>
      {num(road, setRoad, 'อายุสถานะถนน (ชม.)')}{num(water, setWater, 'อายุระดับน้ำ (ชม.)')}{num(supply, setSupply, 'อายุสถานะจุดเสบียง (ชม.)')}
      <label style={{ display: 'block' }}>ข้อมูลหน่วยงานถือว่าเก่าเมื่อเกิน (นาที) <input type="number" min={5} value={agency} onChange={(e) => setAgency(Number(e.target.value))} /></label>
      <p>เกณฑ์เตือนเกจ WL.STN.02 (ค่าเดียวกับที่แสดงบนหน้าแรก; เว้นว่างทั้งคู่ = ไม่แสดงสี):</p>
      <label>เฝ้าระวัง ≥ <input value={watch} onChange={(e) => setWatch(e.target.value)} inputMode="decimal" /></label>{' '}
      <label>อันตราย ≥ <input value={danger} onChange={(e) => setDanger(e.target.value)} inputMode="decimal" /></label>
      <label style={{ display: 'block' }}>พิกัดทางออกหมู่บ้าน (lat, lng) <input value={origin} onChange={(e) => setOrigin(e.target.value)} style={{ width: '100%' }} /></label>
      <button type="button" onClick={save}>บันทึก</button> {msg}
    </section>
  );
}
```

```tsx
// src/ui/components/admin/ContentEditor.tsx
import { useState } from 'react';
import { validatePointGeoJSON, validateRouteInput, validateSegmentGeoJSON, validateWaterLevels } from '../../../core/validateContent';
import { supabase } from '../../../data/supabase';
import type { Snapshot } from '../../../data/types';

type Entity = 'segments' | 'water_marks' | 'places' | 'destinations' | 'routes';
const TEMPLATES: Record<Entity, string> = {
  segments: '{ "id": "seg-soi-1", "name": "ซอย 1", "sort": 1, "geojson": { "type": "LineString", "coordinates": [[100.738, 13.7765], [100.740, 13.7775]] } }',
  water_marks: '{ "id": "mark-wall-1", "name": "กำแพงริมคลองจุด 1", "geojson": { "type": "Point", "coordinates": [100.7385, 13.7768] }, "levels": [{ "level": 1, "label": "ขีดที่ 1" }, { "level": 2, "label": "ขีดที่ 2" }] }',
  places: '{ "id": "place-1", "name": "ร้าน...", "category": "store", "geojson": { "type": "Point", "coordinates": [100.742, 13.778] } }',
  destinations: '{ "id": "dest-city", "name": "เข้าเมือง", "kind": "city", "lat": 13.7563, "lng": 100.5018 }',
  routes: '{ "id": "route-1", "name": "ทางร่มเกล้า-ลาดกระบัง", "destination_id": "dest-city", "segment_ids": ["seg-soi-1"], "waypoints": [{ "lat": 13.75, "lng": 100.6 }], "distance_m": 18000 }',
};

function check(entity: Entity, row: any, snapshot: Snapshot): string[] {
  if (!row?.id || !row?.name) return ['ต้องมี id และ name'];
  if (entity === 'segments') return validateSegmentGeoJSON(row.geojson);
  if (entity === 'places') return [...validatePointGeoJSON(row.geojson), ...(['food', 'market', 'store', 'fuel', 'hospital'].includes(row.category) ? [] : ['category ไม่ถูกต้อง'])];
  if (entity === 'water_marks') return [...validatePointGeoJSON(row.geojson), ...validateWaterLevels(row.levels)];
  if (entity === 'routes') return validateRouteInput({ segmentIds: row.segment_ids ?? [], waypoints: row.waypoints ?? [], distanceM: row.distance_m }, snapshot.segments.map((s) => s.id));
  return typeof row.lat === 'number' && typeof row.lng === 'number' ? [] : ['ต้องมี lat และ lng'];
}

export function ContentEditor({ snapshot, onDone }: { snapshot: Snapshot; onDone: () => void }) {
  const [entity, setEntity] = useState<Entity>('segments');
  const [text, setText] = useState(TEMPLATES.segments);
  const [msgs, setMsgs] = useState<string[]>([]);
  const save = async () => {
    let row: any;
    try { row = JSON.parse(text); } catch { return setMsgs(['JSON ไม่ถูกต้อง']); }
    const errs = check(entity, row, snapshot);
    if (errs.length) return setMsgs(errs);
    const { error } = await supabase.from(entity).upsert(row);
    setMsgs([error ? `ไม่สำเร็จ: ${error.message}` : 'บันทึกแล้ว']); if (!error) onDone();
  };
  const remove = async () => {
    let id: string | undefined; try { id = JSON.parse(text).id; } catch { /* ignore */ }
    if (!id || !confirm(`ลบ ${id}?`)) return;
    const { error } = await supabase.from(entity).delete().eq('id', id);
    setMsgs([error ? `ไม่สำเร็จ: ${error.message}` : 'ลบแล้ว']); if (!error) onDone();
  };
  return (
    <section className="card">
      <h2>จัดการข้อมูลแผนที่ (JSON)</h2>
      <p className="age">วาดเส้นถนน/จุดบน geojson.io แล้ววาง geometry (พิกัดเรียง [lng, lat]) — รายการหลายชิ้นใช้สคริปต์ <code>scripts/import-geo.mjs</code></p>
      <select value={entity} onChange={(e) => { const v = e.target.value as Entity; setEntity(v); setText(TEMPLATES[v]); setMsgs([]); }} style={{ minHeight: 44 }}>
        {(Object.keys(TEMPLATES) as Entity[]).map((e) => <option key={e} value={e}>{e}</option>)}
      </select>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} style={{ width: '100%', fontFamily: 'monospace' }} />
      <button type="button" onClick={save}>บันทึก</button> <button type="button" className="secondary" onClick={remove}>ลบตาม id</button>
      <ul>{msgs.map((m) => <li key={m}>{m}</li>)}</ul>
    </section>
  );
}
```

```tsx
// src/ui/pages/AdminPage.tsx
import { useData } from '../../state/SnapshotContext';
import { AuthGate } from '../components/admin/AuthGate';
import { CommitteeNoteForm } from '../components/admin/CommitteeNoteForm';
import { ContentEditor } from '../components/admin/ContentEditor';
import { ModerationList } from '../components/admin/ModerationList';
import { SettingsForm } from '../components/admin/SettingsForm';

export function AdminPage() {
  const { snapshot, reload, now } = useData();
  return (
    <div className="page">
      <h1>กระดานกรรมการ</h1>
      <AuthGate>
        {(c) => (
          <>
            <p>เข้าสู่ระบบ: {c.email} <button type="button" className="secondary" onClick={c.signOut}>ออก</button></p>
            <CommitteeNoteForm nickname="กรรมการ" onDone={reload} />
            <ModerationList now={now} />
            <SettingsForm snapshot={snapshot!} onDone={reload} />
            <ContentEditor snapshot={snapshot!} onDone={reload} />
          </>
        )}
      </AuthGate>
    </div>
  );
}
```

In `src/ui/App.tsx` add `import { AdminPage } from './pages/AdminPage';` and `<Route path="admin" element={<AdminPage />} />` (not in the tab bar; committee opens `/admin` directly).

- [ ] **Step 5: Write the bulk import script**

```js
// scripts/import-geo.mjs — load many items at once with the service-role key (committee-approved data only).
// Usage: node --env-file=.env scripts/import-geo.mjs <table> <file.json>
// <file.json> is an array of rows in the same shape the admin JSON editor accepts.
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const [table, file] = process.argv.slice(2);
const allowed = ['segments', 'water_marks', 'places', 'destinations', 'routes'];
if (!allowed.includes(table) || !file) { console.error(`usage: import-geo.mjs <${allowed.join('|')}> <file.json>`); process.exit(1); }

const rows = JSON.parse(await readFile(file, 'utf8'));
if (!Array.isArray(rows) || rows.some((r) => !r.id || !r.name)) { console.error('file must be an array of rows each with id and name'); process.exit(1); }

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await db.from(table).upsert(rows);
if (error) { console.error(error.message); process.exit(1); }
console.log(`upserted ${rows.length} rows into ${table}`);
```

- [ ] **Step 6: Run tests, verify admin end-to-end, commit**

Run: `npx vitest run && npx tsc --noEmit` → Expected: all pass.

Manual check on the dev server: open `/admin`, request a magic link (local Supabase captures mail at the Inbucket URL printed by `supabase start`), sign in, add yourself to `committee_members` with the SQL above, reload. Expected: forms appear. Then: (a) post a wall note → it appears under "กรรมการหมู่บ้านแจ้ง" on `/`; (b) confirm a report that had `location_ok=false` → that segment now reflects it on `/map`; (c) delete a report → disappears from the feed; (d) in the editor, paste a segment with swapped `[lat, lng]` → rejected with the "ไกลจากหมู่บ้าน" message; (e) change the road TTL to `0.25` and verify a 20-minute-old report reads "ไม่ทราบ"; (f) while signed out, `/admin` shows only the login box and `supabase.from('settings').upsert(...)` from the console fails.

```bash
git add -A && git commit -m "feat(admin): committee login, moderation, notes, settings and validated content editor"
```

---

### Task 16: PWA, privacy notice, deployment, device verification and drill

**Files:**
- Create: `public/icon.svg`, `scripts/make-icons.mjs`, `src/ui/pages/PrivacyPage.tsx`, `vercel.json`, `README.md`
- Modify: `vite.config.ts` (PWA plugin), `src/ui/App.tsx` (route `/privacy`), `package.json`
- Test: `src/ui/pages/PrivacyPage.test.tsx`

**Interfaces:**
- Consumes: everything above. Task 1 decisions (`POLLER_HOST`, `CAPTURE_MODE`, `QUOTA_OK`).
- Produces: installable PWA, `/privacy` route, deployed production site, completed verification checklist in `docs/spikes/2026-10-phase1-acceptance.md`.

- [ ] **Step 1: Write the failing privacy test**

```tsx
// src/ui/pages/PrivacyPage.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage } from './PrivacyPage';

it('states what is collected, the 30-day retention, the controller and how to request deletion', () => {
  render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
  expect(screen.getByText(/30 วัน/)).toBeInTheDocument();
  expect(screen.getByText(/กรรมการหมู่บ้าน/)).toBeInTheDocument();
  expect(screen.getByText(/ขอลบ/)).toBeInTheDocument();
  expect(screen.getByText(/ข้อมูลชุมชน ไม่ใช่ประกาศเตือนภัยทางการ/)).toBeInTheDocument();
});
```

Run: `npx vitest run src/ui/pages/PrivacyPage.test.tsx` → Expected: FAIL.

- [ ] **Step 2: Implement the privacy page and route**

```tsx
// src/ui/pages/PrivacyPage.tsx
import { DISCLAIMER_TH, MEDIA_RETENTION_DAYS } from '../../core/config';

// DRAFT — have a person with Thai PDPA knowledge review this text before the village-wide launch.
export function PrivacyPage() {
  return (
    <div className="page">
      <h1>ประกาศความเป็นส่วนตัว</h1>
      <p><b>{DISCLAIMER_TH}</b> ผู้ดูแลเป็นอาสาสมัครของหมู่บ้าน ไม่รับประกันความถูกต้องหรือความต่อเนื่องของข้อมูล หากมีอันตรายต่อชีวิต โปรดโทร 1784 (กทม.) หรือ 191 / 1669</p>
      <h2>ข้อมูลที่เก็บ</h2>
      <ul>
        <li>ชื่อเล่นที่คุณกรอก และรหัสอุปกรณ์แบบสุ่มที่เก็บในเครื่องคุณ (ไม่ใช่เบอร์โทร ไม่ใช่บัญชี LINE)</li>
        <li>รูปหรือวิดีโอที่คุณถ่ายเป็นหลักฐาน และตำแหน่ง GPS ขณะส่งรายงาน (ใช้ตรวจว่าอยู่ใกล้จุดที่รายงาน)</li>
        <li>ข้อความและสถานะที่คุณรายงาน เวลาที่ส่ง</li>
      </ul>
      <h2>วัตถุประสงค์และระยะเวลา</h2>
      <p>ใช้แสดงสถานะถนนและจุดเสบียงให้ลูกบ้านและผู้ใช้เส้นทางใกล้เคียงเท่านั้น รูปและวิดีโอจะถูกลบอัตโนมัติหลัง {MEDIA_RETENTION_DAYS} วัน ส่วนข้อความและสถานะเก็บไว้เป็นประวัติของหมู่บ้าน</p>
      <h2>ผู้ควบคุมข้อมูลและสิทธิของคุณ</h2>
      <p>ผู้ควบคุมข้อมูลคือกรรมการหมู่บ้าน คุณสามารถขอลบหรือขอดูข้อมูลของคุณได้โดยแจ้งกรรมการในกลุ่ม LINE ของหมู่บ้าน (ขอลบรายงานที่ระบุเวลาและชื่อเล่นได้)</p>
      <h2>ข้อควรระวัง</h2>
      <p>โปรดอย่าถ่ายใบหน้า ป้ายทะเบียน เลขที่บ้าน หรือข้อมูลส่วนตัวของผู้อื่นในรูปและวิดีโอ แผนที่ใช้ OpenFreeMap / OpenStreetMap ข้อมูลน้ำและฝนจาก กทม. สสน. กรมอุตุนิยมวิทยา ข้อมูลเหตุการณ์จาก iTIC / Longdo Traffic (CC-BY 4.0)</p>
    </div>
  );
}
```

In `src/ui/App.tsx` add `import { PrivacyPage } from './pages/PrivacyPage';` and `<Route path="privacy" element={<PrivacyPage />} />`. Run: `npx vitest run src/ui/pages/PrivacyPage.test.tsx` → Expected: PASS.

- [ ] **Step 3: PWA manifest, icons, and offline shell**

```svg
<!-- public/icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#0b5cab"/><path d="M256 96c-60 90-110 150-110 220a110 110 0 0 0 220 0c0-70-50-130-110-220z" fill="#fff"/></svg>
```

```js
// scripts/make-icons.mjs — run once: node scripts/make-icons.mjs
import sharp from 'sharp';
for (const size of [192, 512]) await sharp('public/icon.svg').resize(size, size).png().toFile(`public/icon-${size}.png`);
console.log('icons written');
```

```bash
npm install -D sharp && node scripts/make-icons.mjs
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'พอร์ทัลน้ำท่วมหมู่บ้าน', short_name: 'น้ำท่วมหมู่บ้าน', lang: 'th', start_url: '/', display: 'standalone',
        background_color: '#f5f7fa', theme_color: '#0b5cab',
        icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
      },
      // Only the app shell is precached. API data is deliberately NOT cached by the service worker:
      // the app keeps its own timestamped snapshot so old data can never look current.
      workbox: { navigateFallback: '/index.html', runtimeCaching: [] },
    }),
  ],
});
```

```json
// vercel.json
{ "rewrites": [{ "source": "/((?!assets|icon).*)", "destination": "/index.html" }] }
```

Run: `npm run build && npx vite preview` and open the printed URL. Expected: build succeeds; DevTools → Application → Manifest shows the name/icons with no errors; "Add to Home Screen" is offered on Android Chrome (check on a phone via the preview URL on the same network).

- [ ] **Step 4: Create the production Supabase project and deploy**

1. Create the production Supabase project (choose the Singapore region for latency from Thailand). Creating a project can incur cost — confirm the plan/price in the dashboard before creating. Record the project ref.
2. Apply the schema only (never the demo seed): `supabase link --project-ref <ref>` then `supabase db push`.
3. Authentication → URL Configuration: set the Site URL to the production domain and add `/admin` redirect.
4. Create `.env.production`-equivalent values in Vercel: `vercel link`, then `vercel env add VITE_SUPABASE_URL production`, `vercel env add VITE_SUPABASE_ANON_KEY production`, `vercel env add VITE_CAPTURE_MODE production` (value from Task 1). Never put the service-role key in Vercel's browser-exposed variables.
5. Deploy: `vercel --prod`. Record the URL in `README.md`.
6. Point the poller at production: on the poller host set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the production project and enable the Task 7 schedule.
7. Load real data: committee reviews `data/places.candidates.json`; segments/marks/destinations/routes are drawn on geojson.io and loaded via the admin editor or `node --env-file=.env scripts/import-geo.mjs <table> <file>` (run against production only with the committee's approved files).
8. Add committee accounts with the SQL from Task 15, Step 3.

- [ ] **Step 5: Write the README**

````markdown
# Village Flood Portal

Community flood-information portal for the village near เคหะร่มเกล้า / คลองสองต้นนุ่น (Lat Krabang, Bangkok).

- Spec: `docs/superpowers/specs/2026-10-04-village-portal-phase1-design.md`
- Plan: `docs/superpowers/plans/2026-10-04-village-portal-phase1.md`
- Production: <fill in after deploy>

## Develop
```bash
cp .env.example .env     # fill from `supabase start` output
supabase start && supabase db reset
npm install && npm run dev
npm test                 # unit tests
npm run test:db          # database integration tests (needs local Supabase)
npm run poll             # fetch agency data once
```

## Safety rules (do not weaken)
Expiry → "ไม่ทราบ"; conflicts show the worse status; passable claims and water levels need fresh photo/video evidence; stale agency data is never shown as current; every datum shows its age. These live in `src/core` (unit-tested) and the `submit_report` RPC (integration-tested).

## Operations
- Poller runs every 10 minutes (see Task 7 schedule) and deletes media older than 30 days.
- Committee access: add users to `committee_members` (see plan Task 15).
````

- [ ] **Step 6: Acceptance verification on real devices (record results)**

Create `docs/spikes/2026-10-phase1-acceptance.md` and fill in, with date and device model for each:

| Check | iPhone (LINE) | iPhone (Safari) | Android (LINE) | Android (Chrome) |
|---|---|---|---|---|
| Open link from the test LINE chat; home renders; ages shown | | | | |
| Report `ผ่านไม่ได้` without photo → appears, segment turns red | | | | |
| Report `รถเล็กไปได้` → blocked until a fresh photo is taken | | | | |
| Gallery photo rejected with the Thai message | | | | |
| Video ≤ 15 s accepted; > 15 s rejected | | | | |
| Location denied → report saved, shows "ตำแหน่งไม่ตรง" until committee confirms | | | | |
| Airplane mode submit → pending banner → auto-send on reconnect | | | | |
| Google Maps button opens with the correct origin/destination/waypoints | | | | |
| Add to Home Screen; reopen offline shows cached data with the offline banner | | | | |

Any failing row is a bug to fix before launch, not a footnote.

- [ ] **Step 7: Run the drill with the committee, then pilot**

Run a 30-minute drill with 3–5 committee members on a real rainy-day or simulated scenario: (1) agree the wall marks and paint/stick them; (2) each member submits road and water-level reports with photos; (3) one member intentionally submits a wrong "รถเล็กไปได้" and another a conflicting "ผ่านไม่ได้" — verify the app shows the worse status with the conflict note and the committee can override; (4) wait past a shortened TTL (set road TTL to 0.25 h) and confirm statuses fall back to "ไม่ทราบ"; (5) kill the poller for 70 minutes and confirm gauges read "ข้อมูลเก่า"; (6) calibrate the `WL.STN.02` watch/danger thresholds against the wall marks during real rain and save them in the admin settings. Then pilot with 10–20 residents for at least one rain event before announcing to the whole group.

- [ ] **Step 8: Final test run and commit**

Run: `npm test && npm run test:db && npm run build`
Expected: all unit tests pass, all DB integration tests pass against local Supabase, production build succeeds.

```bash
git add -A && git commit -m "feat: PWA shell, privacy notice, deployment, acceptance checklist"
```

---

## Self-Review

**Spec coverage** (spec § → task):
- §3.1 Home (summary strip, committee notes, gauge, feed): Task 12. §3.2 Map w/ 5 states: Tasks 3, 11. §3.3 Routes per vehicle class, worst-segment, unknown rule, ranking, Google link, in-app drawing: Tasks 4, 13. §3.4 Reports: Tasks 9, 10. §3.5 Supply points + Overpass seed: Tasks 6, 14. §3.6 Agency data: Tasks 7, 12. §3.7 Committee board (confirm/override/delete/block, manage segments/routes/marks/places, TTL/threshold settings): Task 15.
- §4 Safety rules: evidence matrix (Tasks 3, 6, 9), fresh capture + location flag + committee confirm (Tasks 6, 9, 10), water-level marks (Tasks 6, 10, 15), badges (Task 11), conflict-worse (Task 3), TTLs + never green (Tasks 3, 5, 8), ages everywhere (Tasks 5, 8, 11–14), disclaimer (Task 8, 16), rate limit/nickname/device block (Tasks 6, 15), media resize/video ≤15 s/30-day deletion/PDPA notice (Tasks 7, 9, 10, 16).
- §5 Agency sources, primary gauge, no-colour-until-calibrated, stale handling, failure display, credits: Tasks 5, 7, 12, 15.
- §6 Architecture (Vercel, Supabase, poller, offline queue, cached snapshot, server-side status): Tasks 6–10. **Deviation:** the spec says status is "computed server-side"; this plan computes it in the client from server data using one unit-tested pure module and the server clock offset, so every client applies identical rules to identical data. The database separately enforces the write-side rules (evidence, location, rate limit). Say so to the committee if they ask; moving the computation into a Postgres view later is possible without UI changes.
- §7 Tests: unit tests for each rule listed (Tasks 3–5, 11–13); manual devices and drill (Task 16).
- §8 Spikes: Task 1. §9 Seed data: Tasks 6, 14, 15, 16. §10 Next phases: not built (as specified).

**Placeholder scan:** no TBD/TODO steps. Items intentionally deferred to humans with explicit instructions: village-gate coordinates (`VILLAGE_CENTER` is the WL.STN.02 gauge position until the committee sets `origin` in Settings), real segments/routes/marks/places (drawn with the committee, loaded in Task 16 Step 4.7), committee emails (Task 15 Step 3), `README` production URL (filled after deploy).

**Type consistency:** `Report`/`Resolved` (Task 3) used unchanged in Tasks 4, 8, 11–13; `RouteDef` fields `segmentIds/waypoints/distanceM` match the `routes` mapping in `queries.ts`; `Snapshot` fields used by Tasks 11–15 (`settings.origin`, `settings.gaugeThresholds`, `latest`, `recent`, `feed`) are all defined in Task 8; RPC parameter names in `sendItem` and `CommitteeNoteForm` match `submit_report` in Task 6; error codes in `classifySubmitError` match the SQL exception messages.

**Known judgment calls for the executor:** agency staleness default is 60 minutes and warnings show for 48 hours (not specified by the user — committee can change the first in Settings); the report `ReportPage` shows a generic "pending" message when any retryable error occurs (including rate limiting) — the outbox keeps the item and retries, so nothing is lost.
