import type { RouteDef } from '../core/routes';
import { mapReading, mapReportRow, parseSettings, type ReportRow } from './mappers';
import { computeServerOffset } from './clock';
import { settledOrEmpty } from './settled';
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
      settledOrEmpty(q<any[]>(supabase.from('agency_latest').select('*'))),
      settledOrEmpty(q<any[]>(supabase.from('agency_recent').select('*'))),
      settledOrEmpty(q<any[]>(supabase.from('agency_warnings').select('*').order('issued_at', { ascending: false }).limit(20))),
      settledOrEmpty(q<any[]>(supabase.from('incidents').select('*').order('stop_at', { ascending: false }).limit(100))),
      q<string>(supabase.rpc('server_time')),
    ]);

  const clientNow = Date.now();
  const serverOffsetMs = computeServerOffset(serverTime, clientNow);
  const mapped = reports.map((r) => mapReportRow(r, mediaUrl));
  return {
    segments, marks, places, destinations,
    routes: routes.map((r): RouteDef => ({ id: r.id, name: r.name, destinationId: r.destination_id, segmentIds: r.segment_ids, waypoints: r.waypoints ?? [], distanceM: r.distance_m })),
    settings: parseSettings(settings),
    reports: mapped.map((m) => m.report), feed: mapped.map((m) => m.feed),
    latest: latest.map(mapReading), recent: recent.map(mapReading),
    warnings: warnings.map((w): WarningRow => ({ id: w.id, title: w.title, body: w.body, url: w.url, issuedAt: Date.parse(w.issued_at), mentionsBangkok: w.mentions_bangkok })),
    incidents: incidents.map((i): IncidentRow => ({ id: i.id, title: i.title, lat: i.lat, lng: i.lng, severity: i.severity ?? 0, startAt: Date.parse(i.start_at), stopAt: Date.parse(i.stop_at) })),
    serverOffsetMs,
    fetchedAt: Date.now(),
  };
}
