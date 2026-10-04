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
