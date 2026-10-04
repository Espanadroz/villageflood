import { setWorkerUrl, GeolocateControl, Map as MapLibreMap, NavigationControl, type GeoJSONSource, type MapMouseEvent, type MapGeoJSONFeature } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { STATUS_COLOR } from '../../core/labels';
import type { LatLng, Resolved, RoadStatus } from '../../core/types';
import type { IncidentRow, PlaceRow, SegmentRow } from '../../data/types';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { segmentFeatureCollection } from './geojson';

// Vite pre-bundling/hashing moves the worker file; point MapLibre at the real asset explicitly.
setWorkerUrl(workerUrl);

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'; // free, no key, no view limit

interface Props {
  segments: SegmentRow[]; states: Record<string, Resolved<RoadStatus>>; highlightIds?: string[];
  places?: PlaceRow[]; incidents?: IncidentRow[]; center: LatLng; zoom?: number; height?: string;
  onSelectSegment?: (id: string) => void;
}

const points = (rows: { lng: number; lat: number; props: Record<string, unknown> }[]) => ({
  type: 'FeatureCollection' as const,
  features: rows.map((r) => ({ type: 'Feature' as const, properties: r.props, geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] } })),
});

export function MapView({ segments, states, highlightIds, places = [], incidents = [], center, zoom = 14, height = '55dvh', onSelectSegment }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const onSelect = useRef(onSelectSegment);
  onSelect.current = onSelectSegment;
  const latest = useRef({ segments, states, highlightIds, places, incidents });
  latest.current = { segments, states, highlightIds, places, incidents };

  const push = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const l = latest.current;
    (m.getSource('segments') as GeoJSONSource).setData(segmentFeatureCollection(l.segments, l.states, l.highlightIds));
    (m.getSource('places') as GeoJSONSource).setData(points(l.places.map((p) => ({ lng: p.geojson.coordinates[0]!, lat: p.geojson.coordinates[1]!, props: { name: p.name } }))));
    (m.getSource('incidents') as GeoJSONSource).setData(points(l.incidents.map((i) => ({ lng: i.lng, lat: i.lat, props: { title: i.title } }))));
  };

  useEffect(() => {
    const m = new MapLibreMap({ container: el.current!, style: STYLE, center: [center.lng, center.lat], zoom, attributionControl: { compact: true } });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new GeolocateControl({ trackUserLocation: false }), 'top-right');
    m.on('load', () => {
      for (const id of ['segments', 'places', 'incidents']) m.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const color = ['match', ['get', 'state'], 'dry', STATUS_COLOR.dry, 'small_car', STATUS_COLOR.small_car, 'high_clearance', STATUS_COLOR.high_clearance, 'impassable', STATUS_COLOR.impassable, STATUS_COLOR.unknown] as any;
      m.addLayer({ id: 'seg-known', type: 'line', source: 'segments', filter: ['!=', ['get', 'state'], 'unknown'], layout: { 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': ['case', ['get', 'highlight'], 9, 6] } });
      m.addLayer({ id: 'seg-unknown', type: 'line', source: 'segments', filter: ['==', ['get', 'state'], 'unknown'],
        paint: { 'line-color': STATUS_COLOR.unknown, 'line-width': ['case', ['get', 'highlight'], 8, 5], 'line-dasharray': [1.5, 1.5] } });
      m.addLayer({ id: 'places', type: 'circle', source: 'places', paint: { 'circle-radius': 7, 'circle-color': '#0b5cab', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      m.addLayer({ id: 'incidents', type: 'circle', source: 'incidents', paint: { 'circle-radius': 8, 'circle-color': '#7b2cbf', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      for (const layer of ['seg-known', 'seg-unknown']) {
        m.on('click', layer, (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => { const id = e.features?.[0]?.properties?.id; if (id) onSelect.current?.(String(id)); });
        m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
      }
      ready.current = true;
      push();
    });
    return () => { ready.current = false; m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(push, [segments, states, highlightIds, places, incidents]);
  return <div ref={el} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }} aria-label="แผนที่สถานะถนน" />;
}
