import type { Feature, FeatureCollection, LineString, MultiLineString } from 'geojson';
import type { RouteDef } from '../../core/routes';
import type { Resolved, RoadStatus, SegmentState } from '../../core/types';
import type { SegmentRow } from '../../data/types';

export type SegmentProps = { id: string; name: string; state: SegmentState; conflict: boolean; highlight: boolean };

export function segmentFeatureCollection(
  segments: SegmentRow[], states: Record<string, Resolved<RoadStatus>>, highlightIds: string[] = [],
): FeatureCollection<LineString, SegmentProps> {
  return {
    type: 'FeatureCollection',
    features: segments.map((s) => ({
      type: 'Feature', geometry: s.geojson,
      properties: { id: s.id, name: s.name, state: states[s.id]?.value ?? 'unknown', conflict: states[s.id]?.conflict ?? false, highlight: highlightIds.includes(s.id) },
    })),
  };
}

export function routeLine(route: RouteDef, segments: SegmentRow[]): Feature<MultiLineString> {
  const byId = new Map(segments.map((s) => [s.id, s]));
  const lines = route.segmentIds.map((id) => byId.get(id)?.geojson.coordinates).filter((c): c is number[][] => !!c);
  return { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } };
}
