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
