import type { Feature, FeatureCollection, LineString, MultiLineString } from 'geojson';
import type { RouteDef } from '../../core/routes';
import type { Resolved, RoadStatus, SegmentState } from '../../core/types';
import type { IncidentRow, PlaceRow, SegmentRow } from '../../data/types';

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const validLine = (s: SegmentRow) => {
  const c = s?.geojson?.coordinates;
  return Array.isArray(c) && c.length >= 2 && c.every((p) => Array.isArray(p) && finite(p[0]) && finite(p[1]));
};

export type SegmentProps = { id: string; name: string; state: SegmentState; conflict: boolean; highlight: boolean };

export function segmentFeatureCollection(
  segments: SegmentRow[], states: Record<string, Resolved<RoadStatus>>, highlightIds: string[] = [],
): FeatureCollection<LineString, SegmentProps> {
  return {
    type: 'FeatureCollection',
    features: segments.filter(validLine).map((s) => ({
      type: 'Feature', geometry: s.geojson,
      properties: { id: s.id, name: s.name, state: states[s.id]?.value ?? 'unknown', conflict: states[s.id]?.conflict ?? false, highlight: highlightIds.includes(s.id) },
    })),
  };
}

export function routeLine(route: RouteDef, segments: SegmentRow[]): Feature<MultiLineString> {
  const byId = new Map(segments.map((s) => [s.id, s]));
  const lines = route.segmentIds.map((id) => byId.get(id)?.geojson?.coordinates).filter((c): c is number[][] => !!c);
  return { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } };
}

const pointFc = (rows: { lng: unknown; lat: unknown; props: Record<string, unknown> }[]) => ({
  type: 'FeatureCollection' as const,
  features: rows.filter((r) => finite(r.lng) && finite(r.lat)).map((r) => ({
    type: 'Feature' as const, properties: r.props, geometry: { type: 'Point' as const, coordinates: [r.lng as number, r.lat as number] },
  })),
});
export const placePoints = (places: PlaceRow[]) =>
  pointFc(places.map((p) => ({ lng: p?.geojson?.coordinates?.[0], lat: p?.geojson?.coordinates?.[1], props: { name: p?.name } })));
export const incidentPoints = (incidents: IncidentRow[]) =>
  pointFc(incidents.map((i) => ({ lng: i?.lng, lat: i?.lat, props: { title: i?.title } })));

export interface PushInputs { segments: unknown; states: unknown; highlightIds: unknown; places: unknown; incidents: unknown }
/** Which map sources need setData: only those whose input references changed since the last push. */
export function shouldPush(prev: PushInputs | null, next: PushInputs): { segments: boolean; places: boolean; incidents: boolean } {
  if (!prev) return { segments: true, places: true, incidents: true };
  return {
    segments: prev.segments !== next.segments || prev.states !== next.states || prev.highlightIds !== next.highlightIds,
    places: prev.places !== next.places,
    incidents: prev.incidents !== next.incidents,
  };
}
