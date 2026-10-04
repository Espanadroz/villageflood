// Run: npm run test:db   (needs a LOCAL or DEV Supabase with seed.sql applied; reads .env)
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(url, process.env.SUPABASE_ANON_KEY!, opts);
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);

const NEAR = { lat: 13.7770, lng: 100.7390 }; // within 150 m of seg-demo-1
const FAR = { lat: 13.8500, lng: 100.9000 };
const submit = (device: string, o: Record<string, unknown>, client = anon) =>
  client.rpc('submit_report', {
    p_device: device, p_nickname: 'ทดสอบ', p_kind: 'road', p_target: 'seg-demo-1', p_value: 'impassable',
    p_lat: NEAR.lat, p_lng: NEAR.lng, p_media_path: null, p_media_type: null, p_note: null, ...o,
  });

// Upload a tiny JPEG-like blob as evidence (service role) and return its path.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
async function evidence(dev: string, name = `${crypto.randomUUID()}.jpg`) {
  const path = `${dev}/${name}`;
  const { error } = await service.storage.from('evidence').upload(path, new Blob([JPEG], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  expect(error).toBeNull();
  return path;
}
const withMedia = async (dev: string, o: Record<string, unknown> = {}) =>
  ({ p_media_path: await evidence(dev), p_media_type: 'image/jpeg', ...o });
const okReport = async (dev = crypto.randomUUID()) => {
  const r = await submit(dev, {});
  expect(r.error).toBeNull();
  return { dev, id: r.data as string };
};
const row = async (id: string) =>
  (await service.from('reports').select('*').eq('id', id).single()).data!;

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
  it('accepts a passable claim with uploaded evidence', async () => {
    const dev = crypto.randomUUID();
    const { data, error } = await submit(dev, await withMedia(dev, { p_value: 'dry' }));
    expect(error).toBeNull();
    expect((await row(data as string)).media_type).toBe('image/jpeg');
  });
  it('flags location_ok=true near the segment and false far away', async () => {
    const dev = crypto.randomUUID();
    const a = await submit(dev, await withMedia(dev, { p_value: 'dry' }));
    const b = await submit(dev, await withMedia(dev, { p_value: 'dry', p_lat: FAR.lat, p_lng: FAR.lng }));
    const { data } = await service.from('reports').select('id, location_ok').in('id', [a.data, b.data]);
    expect(data!.find((r) => r.id === a.data)!.location_ok).toBe(true);
    expect(data!.find((r) => r.id === b.data)!.location_ok).toBe(false);
  });
  it('road distance limit: ~100 m from the segment ok, ~300 m not', async () => {
    // seg-demo-1 starts at (100.7380, 13.7765); points due south of that vertex
    const a = await submit(crypto.randomUUID(), { p_lat: 13.7765 - 0.0009, p_lng: 100.7380 });
    const b = await submit(crypto.randomUUID(), { p_lat: 13.7765 - 0.0027, p_lng: 100.7380 });
    expect((await row(a.data as string)).location_ok).toBe(true);
    expect((await row(b.data as string)).location_ok).toBe(false);
  });
  it('water mark uses the 100 m limit', async () => {
    const dev = crypto.randomUUID();
    const base = { p_kind: 'water_level', p_target: 'mark-demo-wall', p_value: '2' };
    const a = await submit(dev, await withMedia(dev, { ...base, p_lat: 13.7768, p_lng: 100.7385 }));
    const b = await submit(dev, await withMedia(dev, { ...base, p_lat: 13.7768 - 0.0027, p_lng: 100.7385 }));
    expect((await row(a.data as string)).location_ok).toBe(true);
    expect((await row(b.data as string)).location_ok).toBe(false);
  });
  it('supply report against the seeded place uses the 150 m limit', async () => {
    const base = { p_kind: 'supply', p_target: 'place-demo-1', p_value: 'open' };
    const a = await submit(crypto.randomUUID(), { ...base, p_lat: 13.7780, p_lng: 100.7420 });
    const b = await submit(crypto.randomUUID(), { ...base, p_lat: FAR.lat, p_lng: FAR.lng });
    expect(a.error).toBeNull();
    expect((await row(a.data as string)).location_ok).toBe(true);
    expect((await row(b.data as string)).location_ok).toBe(false);
    expect((await submit(crypto.randomUUID(), { ...base, p_value: 'flying' })).error?.message).toContain('invalid_value');
  });
  it('flags location_ok=false when no coordinates are sent', async () => {
    const r = await submit(crypto.randomUUID(), { p_lat: null, p_lng: null });
    expect((await row(r.data as string)).location_ok).toBe(false);
  });
  it('treats out-of-range coordinates as missing', async () => {
    const r = await submit(crypto.randomUUID(), { p_lat: 999, p_lng: 100.739 });
    const rr = await row(r.data as string);
    expect(rr.location_ok).toBe(false);
    expect(rr.lat).toBeNull();
  });
  it('rejects unknown target, invalid value, empty nickname', async () => {
    expect((await submit(crypto.randomUUID(), { p_target: 'nope' })).error?.message).toContain('unknown_target');
    expect((await submit(crypto.randomUUID(), { p_value: 'flying' })).error?.message).toContain('invalid_value');
    expect((await submit(crypto.randomUUID(), { p_nickname: '  ' })).error?.message).toContain('nickname_required');
  });
  it('rejects water level values that are not on the mark', async () => {
    const dev = crypto.randomUUID();
    const { error } = await submit(dev, await withMedia(dev, { p_kind: 'water_level', p_target: 'mark-demo-wall', p_value: '9' }));
    expect(error?.message).toContain('invalid_value');
  });
  it('validates general village notes', async () => {
    const g = { p_kind: 'general', p_target: 'village', p_value: 'note', p_note: 'ไฟฟ้าดับ' };
    expect((await submit(crypto.randomUUID(), { ...g, p_note: '  ' })).error?.message).toContain('invalid_value');
    expect((await submit(crypto.randomUUID(), { ...g, p_note: null })).error?.message).toContain('invalid_value');
    expect((await submit(crypto.randomUUID(), { ...g, p_value: 'other' })).error?.message).toContain('invalid_value');
    const ok = await submit(crypto.randomUUID(), g);
    expect(ok.error).toBeNull();
    const r = await row(ok.data as string);
    expect(r.location_ok).toBe(true);
    expect(r.by_committee).toBe(false);
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
  it('rejects blocked devices and does not let them rename', async () => {
    const dev = crypto.randomUUID();
    await submit(dev, {});
    await service.from('devices').update({ blocked: true }).eq('id', dev);
    expect((await submit(dev, { p_nickname: 'ชื่อใหม่' })).error?.message).toContain('device_blocked');
    const { data } = await service.from('devices').select('nickname').eq('id', dev).single();
    expect(data!.nickname).toBe('ทดสอบ');
  });
});

describe('evidence verification', () => {
  it('rejects a path whose object was never uploaded', async () => {
    const dev = crypto.randomUUID();
    const { error } = await submit(dev, { p_value: 'dry', p_media_path: `${dev}/ghost.jpg`, p_media_type: 'image/jpeg' });
    expect(error?.message).toContain('invalid_media');
  });
  it("rejects another device's folder", async () => {
    const dev = crypto.randomUUID(); const other = crypto.randomUUID();
    const p = await evidence(other);
    const { error } = await submit(dev, { p_value: 'dry', p_media_path: p, p_media_type: 'image/jpeg' });
    expect(error?.message).toContain('invalid_media');
  });
  it('rejects a bad or missing media type', async () => {
    const dev = crypto.randomUUID();
    const p = await evidence(dev);
    expect((await submit(dev, { p_value: 'dry', p_media_path: p, p_media_type: 'image/gif' })).error?.message).toContain('invalid_media');
    expect((await submit(dev, { p_value: 'dry', p_media_path: p, p_media_type: null })).error?.message).toContain('invalid_media');
  });
  it('rejects malformed paths', async () => {
    const dev = crypto.randomUUID();
    for (const p of [`${dev}/a/b.jpg`, `${dev}/`, `../${dev}/a.jpg`, `${dev}/${'x'.repeat(200)}.jpg`]) {
      expect((await submit(dev, { p_value: 'dry', p_media_path: p, p_media_type: 'image/jpeg' })).error?.message).toContain('invalid_media');
    }
  });
  it('anon can upload only into a uuid folder of the evidence bucket', async () => {
    const dev = crypto.randomUUID();
    const blob = new Blob([JPEG], { type: 'image/jpeg' });
    expect((await anon.storage.from('evidence').upload(`${dev}/anon-${crypto.randomUUID()}.jpg`, blob, { contentType: 'image/jpeg' })).error).toBeNull();
    expect((await anon.storage.from('evidence').upload(`not-a-uuid/${crypto.randomUUID()}.jpg`, blob, { contentType: 'image/jpeg' })).error).not.toBeNull();
    expect((await anon.storage.from('evidence').upload(`${crypto.randomUUID()}.jpg`, blob, { contentType: 'image/jpeg' })).error).not.toBeNull();
  });
});

describe('confirm_report', () => {
  const confirm = (device: string, report: string) => anon.rpc('confirm_report', { p_device: device, p_report: report });
  const count = async (id: string) =>
    (await service.from('confirmations').select('*', { count: 'exact', head: true }).eq('report_id', id)).count;

  it('rejects unknown and deleted reports', async () => {
    const { dev } = await okReport();
    expect((await confirm(dev, crypto.randomUUID())).error?.message).toContain('unknown_report');
    const other = await okReport();
    await service.from('reports').update({ deleted: true }).eq('id', other.id);
    expect((await confirm(dev, other.id)).error?.message).toContain('unknown_report');
  });
  it('rejects devices that never reported and does not create them', async () => {
    const { id } = await okReport();
    const stranger = crypto.randomUUID();
    expect((await confirm(stranger, id)).error?.message).toContain('not_a_reporter');
    const { data } = await service.from('devices').select('id').eq('id', stranger);
    expect(data).toHaveLength(0);
  });
  it('ignores self-confirmation', async () => {
    const { dev, id } = await okReport();
    expect((await confirm(dev, id)).error).toBeNull();
    expect(await count(id)).toBe(0);
  });
  it('counts a second reporter once even if repeated', async () => {
    const { id } = await okReport();
    const { dev: b } = await okReport();
    expect((await confirm(b, id)).error).toBeNull();
    expect((await confirm(b, id)).error).toBeNull();
    expect(await count(id)).toBe(1);
    const { data } = await anon.from('reports_public').select('confirmations').eq('id', id).single();
    expect(Number(data!.confirmations)).toBe(1);
  });
  it('rejects blocked devices', async () => {
    const { id } = await okReport();
    const { dev: b } = await okReport();
    await service.from('devices').update({ blocked: true }).eq('id', b);
    expect((await confirm(b, id)).error?.message).toContain('device_blocked');
  });
  it('rate-limits at 30 confirmations per 10 minutes', async () => {
    const { dev: b } = await okReport();
    const targets = await Promise.all(Array.from({ length: 31 }, () => okReport().then((r) => r.id)));
    for (let i = 0; i < 30; i++) expect((await confirm(b, targets[i]!)).error).toBeNull();
    expect((await confirm(b, targets[30]!)).error?.message).toContain('rate_limited');
  });
});

describe('access control', () => {
  it('anon cannot read the raw reports table', async () => {
    await okReport();
    const { data, error } = await anon.from('reports').select('*').limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
  it('anon cannot read devices or confirmations', async () => {
    for (const t of ['devices', 'confirmations', 'committee_members']) {
      const { data, error } = await anon.from(t).select('*').limit(1);
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    }
  });
  it('anon cannot insert directly into reports', async () => {
    const dev = crypto.randomUUID();
    const { error } = await anon.from('reports').insert({ kind: 'road', target_id: 'seg-demo-1', value: 'dry', device_id: dev, nickname: 'x', location_ok: true });
    expect(error).not.toBeNull();
  });
  it('reports_public hides device_id and exposes exactly the public columns', async () => {
    const { id } = await okReport();
    const { data, error } = await anon.from('reports_public').select('*').eq('id', id).single();
    expect(error).toBeNull();
    expect(Object.keys(data!).sort()).toEqual([
      'by_committee', 'confirmations', 'confirmed_by_committee', 'created_at', 'id', 'kind', 'lat', 'lng',
      'location_ok', 'media_path', 'media_type', 'nickname', 'note', 'target_id', 'value',
    ]);
  });
  it('anon cannot PATCH or DELETE through reports_public', async () => {
    const { id } = await okReport();
    const p = await anon.from('reports_public').update({ confirmed_by_committee: true }).eq('id', id);
    expect(p.error).not.toBeNull();
    const d = await anon.from('reports_public').delete().eq('id', id);
    expect(d.error).not.toBeNull();
    const r = await row(id);
    expect(r.confirmed_by_committee).toBe(false);
    expect(r.deleted).toBe(false);
  });
  it('anon cannot write through agency views or tables', async () => {
    const station = `T-${crypto.randomUUID()}`;
    const observed_at = new Date().toISOString();
    const base = { source: 'test', station_id: station, station_name: 's', metric: 'level', value: 1, unit: 'm', observed_at };
    expect((await service.from('agency_readings').insert(base)).error).toBeNull();
    const q = () => service.from('agency_readings').select('value').eq('station_id', station);
    for (const t of ['agency_recent', 'agency_latest', 'agency_readings']) {
      expect((await anon.from(t).update({ value: 99 }).eq('station_id', station)).error).not.toBeNull();
      expect((await anon.from(t).delete().eq('station_id', station)).error).not.toBeNull();
      expect((await anon.from(t).insert({ ...base, station_id: `${station}-x` })).error).not.toBeNull();
    }
    const { data } = await q();
    expect(data).toEqual([{ value: 1 }]);
    expect((await service.from('agency_readings').select('station_id').eq('station_id', `${station}-x`)).data).toHaveLength(0);
    await service.from('agency_readings').delete().eq('station_id', station);
  });
  it('anon cannot moderate', async () => {
    const { error } = await anon.rpc('moderate_report', { p_report: crypto.randomUUID(), p_action: 'delete' });
    expect(error?.message).toContain('committee_only');
  });
  it('anon cannot change settings', async () => {
    const u = await anon.from('settings').update({ value: '1' }).eq('key', 'agency_max_age_ms');
    expect(u.error).not.toBeNull();
    expect((await anon.from('settings').insert({ key: 'evil', value: '1' })).error).not.toBeNull();
    expect((await anon.from('settings').delete().eq('key', 'agency_max_age_ms')).error).not.toBeNull();
    const { data } = await service.from('settings').select('value').eq('key', 'agency_max_age_ms').single();
    expect(data!.value).toBe(3600000);
    expect((await service.from('settings').select('key').eq('key', 'evil')).data).toHaveLength(0);
  });
  it('anon cannot change segments but can read them', async () => {
    expect((await anon.from('segments').update({ name: 'x' }).eq('id', 'seg-demo-1')).error).not.toBeNull();
    expect((await anon.from('segments').delete().eq('id', 'seg-demo-1')).error).not.toBeNull();
    expect((await anon.from('segments').insert({ id: 'evil', name: 'x', geojson: { type: 'Point', coordinates: [0, 0] } })).error).not.toBeNull();
    const { data, error } = await anon.from('segments').select('id, name');
    expect(error).toBeNull();
    expect(data!.map((s) => s.id)).toEqual(expect.arrayContaining(['seg-demo-1', 'seg-demo-2']));
    expect(data!.find((s) => s.id === 'seg-demo-1')!.name).not.toBe('x');
  });
  it('anon cannot call internal helper functions', async () => {
    expect((await anon.rpc('requires_evidence', { p_kind: 'road', p_value: 'dry' })).error).not.toBeNull();
  });
});

describe('committee', () => {
  async function userClient(committee: boolean) {
    const email = `c-${crypto.randomUUID()}@example.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(error).toBeNull();
    if (committee) expect((await service.from('committee_members').insert({ user_id: data.user!.id })).error).toBeNull();
    const client = createClient(url, process.env.SUPABASE_ANON_KEY!, opts);
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    return client;
  }

  it('committee can confirm and delete reports', async () => {
    const c = await userClient(true);
    const { id } = await okReport();
    expect((await c.rpc('moderate_report', { p_report: id, p_action: 'confirm' })).error).toBeNull();
    expect((await row(id)).confirmed_by_committee).toBe(true);
    expect((await c.rpc('moderate_report', { p_report: id, p_action: 'bogus' })).error?.message).toContain('invalid_value');
    expect((await c.rpc('moderate_report', { p_report: id, p_action: 'delete' })).error).toBeNull();
    expect((await anon.from('reports_public').select('id').eq('id', id)).data).toHaveLength(0);
    expect((await row(id)).deleted).toBe(true);
  });
  it('committee general wall note is accepted and flagged by_committee', async () => {
    const c = await userClient(true);
    const r = await submit(crypto.randomUUID(), { p_kind: 'general', p_target: 'wall', p_value: 'note', p_note: 'กำแพงมีรอยร้าว' }, c);
    expect(r.error).toBeNull();
    expect((await row(r.data as string)).by_committee).toBe(true);
  });
  it('committee can read raw reports; a signed-in non-committee user cannot', async () => {
    const c = await userClient(true); const n = await userClient(false);
    await okReport();
    expect((await c.from('reports').select('id').limit(1)).data!.length).toBe(1);
    expect((await n.from('reports').select('id').limit(1)).data ?? []).toHaveLength(0);
  });
  it('non-committee users cannot moderate or write wall notes', async () => {
    const n = await userClient(false);
    const { id } = await okReport();
    expect((await n.rpc('moderate_report', { p_report: id, p_action: 'confirm' })).error?.message).toContain('committee_only');
    expect((await row(id)).confirmed_by_committee).toBe(false);
    const w = await submit(crypto.randomUUID(), { p_kind: 'general', p_target: 'wall', p_value: 'note', p_note: 'x' }, n);
    expect(w.error?.message).toContain('committee_only');
  });
  it('committee can edit reference data; non-committee cannot', async () => {
    const c = await userClient(true); const n = await userClient(false);
    const nn = await n.from('segments').update({ sort: 7 }).eq('id', 'seg-demo-2').select();
    expect(nn.data ?? []).toHaveLength(0);
    const cc = await c.from('segments').update({ sort: 0 }).eq('id', 'seg-demo-2').select();
    expect(cc.error).toBeNull();
    expect(cc.data).toHaveLength(1);
  });
});

describe('idempotent submit_report (client_id)', () => {
  const countRows = async (dev: string) =>
    (await service.from('reports').select('*', { count: 'exact', head: true }).eq('device_id', dev)).count;

  it('same (device, client_id) twice returns the same id and one row', async () => {
    const dev = crypto.randomUUID(); const cid = crypto.randomUUID();
    const a = await submit(dev, { p_client_id: cid });
    const b = await submit(dev, { p_client_id: cid });
    expect(a.error).toBeNull(); expect(b.error).toBeNull();
    expect(b.data).toBe(a.data);
    expect(await countRows(dev)).toBe(1);
    expect((await row(a.data as string)).client_id).toBe(cid);
  });
  it('same client_id from two devices makes two rows', async () => {
    const cid = crypto.randomUUID();
    const a = await submit(crypto.randomUUID(), { p_client_id: cid });
    const b = await submit(crypto.randomUUID(), { p_client_id: cid });
    expect(a.data).not.toBe(b.data);
  });
  it('null client_id is not deduplicated', async () => {
    const dev = crypto.randomUUID();
    const a = await submit(dev, {}); const b = await submit(dev, {});
    expect(a.data).not.toBe(b.data);
    expect(await countRows(dev)).toBe(2);
  });
  it('a replay does not consume a rate-limit slot', async () => {
    const dev = crypto.randomUUID(); const first = crypto.randomUUID();
    const r1 = await submit(dev, { p_client_id: first });
    for (let i = 1; i < 10; i++) expect((await submit(dev, { p_client_id: crypto.randomUUID() })).error).toBeNull();
    const replay = await submit(dev, { p_client_id: first });
    expect(replay.error).toBeNull();
    expect(replay.data).toBe(r1.data);
    expect((await submit(dev, { p_client_id: crypto.randomUUID() })).error?.message).toContain('rate_limited');
    expect(await countRows(dev)).toBe(10);
  });
  it('a replay by a blocked device is rejected', async () => {
    const dev = crypto.randomUUID(); const cid = crypto.randomUUID();
    await submit(dev, { p_client_id: cid });
    await service.from('devices').update({ blocked: true }).eq('id', dev);
    expect((await submit(dev, { p_client_id: cid })).error?.message).toContain('device_blocked');
  });
  it('concurrent identical replays produce one row', async () => {
    const dev = crypto.randomUUID(); const cid = crypto.randomUUID();
    const rs = await Promise.all(Array.from({ length: 5 }, () => submit(dev, { p_client_id: cid })));
    rs.forEach((r) => expect(r.error).toBeNull());
    expect(new Set(rs.map((r) => r.data)).size).toBe(1);
    expect(await countRows(dev)).toBe(1);
  });
  it('a replay with different content returns the original and leaves it unchanged', async () => {
    const dev = crypto.randomUUID(); const cid = crypto.randomUUID();
    const a = await submit(dev, { p_client_id: cid, p_value: 'impassable' });
    const b = await submit(dev, { p_client_id: cid, p_value: 'flying', p_target: 'nope', p_lat: FAR.lat, p_lng: FAR.lng });
    expect(b.error).toBeNull();
    expect(b.data).toBe(a.data);
    const r = await row(a.data as string);
    expect(r.value).toBe('impassable');
    expect(r.target_id).toBe('seg-demo-1');
    expect(r.location_ok).toBe(true);
  });
  it('has a single submit_report overload that anon can execute', async () => {
    const psql = (sql: string) =>
      execFileSync('docker', ['exec', 'supabase_db_village-flood-app', 'psql', '-U', 'postgres', '-At', '-c', sql]).toString().trim();
    expect(psql("select proname || ':' || pronargs from pg_proc where proname='submit_report'")).toBe('submit_report:11');
    expect(psql("select has_function_privilege('anon', 'submit_report(uuid,text,text,text,text,double precision,double precision,text,text,text,uuid)', 'execute')")).toBe('t');
    expect(psql("select has_function_privilege('public', 'submit_report(uuid,text,text,text,text,double precision,double precision,text,text,text,uuid)', 'execute')")).toBe('f');
    expect((await submit(crypto.randomUUID(), { p_client_id: crypto.randomUUID() })).error).toBeNull();
  });
});
