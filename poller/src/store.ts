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
