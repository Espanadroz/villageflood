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
