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
