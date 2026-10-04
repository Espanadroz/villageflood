import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE = 100;
const BATCH = 100;
const URL_BATCH = 20; // report-row filters travel in the URL; 100 paths exceed the gateway's URI limit

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
  for (const ids of chunk(expired.map((r) => r.id), URL_BATCH)) {
    const { error: upErr } = await db.from('reports').update({ media_path: null, media_type: null }).in('id', ids);
    if (upErr) throw upErr;
  }
  return expired.length;
}

// ---- Orphan objects: anything in the evidence bucket older than the retention period, regardless of report rows
// (uploads whose report was never submitted, rejected or deleted). Uses the object's own created_at.

export interface StorageEntry { name: string; id: string | null; created_at?: string | null }
export type ListFn = (prefix: string, offset: number, limit: number) => Promise<StorageEntry[]>;
export interface StoredObject { path: string; created_at: string | null }


export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Objects older than `days`; an unknown/invalid created_at is never deleted (cannot prove it is old). */
export function selectOrphanObjects(objs: StoredObject[], now: Date, days: number): string[] {
  const cutoff = now.getTime() - days * 24 * 3_600_000;
  return objs.filter((o) => { const t = o.created_at ? Date.parse(o.created_at) : NaN; return Number.isFinite(t) && t < cutoff; }).map((o) => o.path);
}

async function listAll(list: ListFn, prefix: string, pageSize: number): Promise<StorageEntry[]> {
  const out: StorageEntry[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await list(prefix, offset, pageSize);
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}

/** Lists top-level folders (upload keys), then every file inside each, with pagination. Folders have id === null. */
export async function listEvidenceObjects(list: ListFn, pageSize = PAGE): Promise<StoredObject[]> {
  const top = await listAll(list, '', pageSize);
  const out: StoredObject[] = top.filter((e) => e.id !== null).map((e) => ({ path: e.name, created_at: e.created_at ?? null }));
  for (const folder of top.filter((e) => e.id === null)) {
    const files = await listAll(list, folder.name, pageSize);
    for (const f of files) if (f.id !== null) out.push({ path: `${folder.name}/${f.name}`, created_at: f.created_at ?? null });
  }
  return out;
}

export async function deleteOrphanMedia(db: SupabaseClient, now: Date, days: number): Promise<number> {
  const bucket = db.storage.from('evidence');
  const list: ListFn = async (prefix, offset, limit) => {
    const { data, error } = await bucket.list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    return (data ?? []) as StorageEntry[];
  };
  const old = selectOrphanObjects(await listEvidenceObjects(list), now, days);
  let removed = 0;
  for (const batch of chunk(old, BATCH)) {
    const { error } = await bucket.remove(batch);
    if (error) throw error;
    // a report still pointing at a removed file loses its evidence (fails closed: passable claims stop counting)
    for (const part of chunk(batch, URL_BATCH)) {
      const { error: upErr } = await db.from('reports').update({ media_path: null, media_type: null }).in('media_path', part);
      if (upErr) throw upErr;
    }
    removed += batch.length;
  }
  return removed;
}
