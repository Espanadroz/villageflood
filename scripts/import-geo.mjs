// scripts/import-geo.mjs — load many content rows at once with the service-role key (committee-approved data only).
// Node-only script, never bundled into the browser app.
// Usage:  npx tsx --env-file=.env scripts/import-geo.mjs <table> <file.json> [--dry-run] [--allow-overwrite] [--i-know-this-is-production]
// (tsx is required because the script imports the shared TypeScript validators from src/core/validateContent.ts.)
// <file.json> is an array of rows in the same shape the admin JSON editor accepts.
// All-or-nothing: every row is validated first; if any row fails, nothing is uploaded and the exit code is 1.
// Refuses to run against a non-local SUPABASE_URL unless --i-know-this-is-production is passed.
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { CONTENT_ENTITIES, validateContentRow } from '../src/core/validateContent.ts';

const args = process.argv.slice(2);
const KNOWN_FLAGS = ['--dry-run', '--allow-overwrite', '--i-know-this-is-production'];
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [table, file] = args.filter((a) => !a.startsWith('--'));
const die = (msg) => { console.error(msg); process.exit(1); };
const usage = `usage: import-geo.mjs <${CONTENT_ENTITIES.join('|')}> <file.json> [${KNOWN_FLAGS.join('] [')}]`;
for (const f of flags) if (!KNOWN_FLAGS.includes(f)) die(`ไม่รู้จัก flag: ${f}\n${usage}`);

if (!CONTENT_ENTITIES.includes(table) || !file) die(usage);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) die('ต้องตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY (เช่น --env-file=.env)');

let host;
try { host = new URL(url).hostname; } catch { die('SUPABASE_URL ไม่ถูกต้อง'); }
const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.endsWith('.localhost');
if (!isLocal && !flags.has('--i-know-this-is-production')) {
  die(`ปฏิเสธ: SUPABASE_URL ชี้ไปที่ host ที่ไม่ใช่เครื่อง local (${host}). ถ้าตั้งใจนำเข้าข้อมูลจริง ให้เพิ่ม --i-know-this-is-production`);
}

let rows;
try { rows = JSON.parse(await readFile(file, 'utf8')); } catch (e) { die(`อ่านไฟล์ไม่ได้/JSON ไม่ถูกต้อง: ${e.message}`); }
if (!Array.isArray(rows) || rows.length === 0) die('ไฟล์ต้องเป็น array ของแถวข้อมูล (อย่างน้อย 1 แถว)');

const db = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { transport: ws }, // Node < 22 has no global WebSocket; the client constructor needs one (never subscribes)
});

// For routes, segments may be referenced from the DB.
let knownSegments = [];
if (table === 'routes') {
  const { data, error } = await db.from('segments').select('id');
  if (error) die(`อ่านรายการช่วงถนนไม่ได้: ${error.message}`);
  knownSegments = data.map((r) => r.id);
}

let failed = 0;
const seen = new Set();
rows.forEach((row, i) => {
  const errs = validateContentRow(table, row, knownSegments);
  if (row?.id && seen.has(row.id)) errs.push(`id ซ้ำในไฟล์: ${row.id}`);
  if (row?.id) seen.add(row.id);
  if (errs.length) { failed++; console.error(`แถวที่ ${i + 1} (${row?.id ?? 'ไม่มี id'}): ${errs.join(' | ')}`); }
});
if (failed) die(`ตรวจไม่ผ่าน ${failed}/${rows.length} แถว — ไม่ได้อัปโหลดอะไรเลย`);

// Report rows whose id already exists (upsert would overwrite them).
const { data: existing, error: exErr } = await db.from(table).select('id').in('id', rows.map((r) => r.id));
if (exErr) die(`ตรวจ id ที่มีอยู่ไม่ได้: ${exErr.message}`);
const existingIds = existing.map((r) => r.id);
console.log(`id ที่มีอยู่แล้วในฐานข้อมูล: ${existingIds.length}/${rows.length}${existingIds.length ? ` (${existingIds.join(', ')})` : ''}`);
if (existingIds.length && !flags.has('--allow-overwrite')) die('จะเขียนทับรายการเดิม — ไม่ได้อัปโหลด. ถ้าตั้งใจ ให้เพิ่ม --allow-overwrite');

if (flags.has('--dry-run')) { console.log(`dry-run: ${rows.length} แถวผ่านการตรวจสอบ (${table}) — ยังไม่อัปโหลด`); process.exit(0); }

const { error } = await db.from(table).upsert(rows);
if (error) die(`อัปโหลดไม่สำเร็จ: ${error.message}`);
console.log(`upserted ${rows.length} rows into ${table}`);
