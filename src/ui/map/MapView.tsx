import { setWorkerUrl, GeolocateControl, Map as MapLibreMap, NavigationControl, type GeoJSONSource, type MapMouseEvent, type MapGeoJSONFeature } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { STATUS_COLOR } from '../../core/labels';
import type { LatLng, Resolved, RoadStatus } from '../../core/types';
import type { IncidentRow, PlaceRow, SegmentRow } from '../../data/types';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { isFatalMapError } from './fatal';
import { incidentPoints, placePoints, segmentFeatureCollection, shouldPush, type PushInputs } from './geojson';

// The worker imports a sibling shared chunk; ?worker&url makes Vite bundle it into one self-contained file.
setWorkerUrl(workerUrl);

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'; // free, no key, no view limit

interface Props {
  segments: SegmentRow[]; states: Record<string, Resolved<RoadStatus>>; highlightIds?: string[];
  places?: PlaceRow[]; incidents?: IncidentRow[]; center: LatLng; zoom?: number; height?: string;
  onSelectSegment?: (id: string) => void; onError?: (message: string) => void; onHealthy?: () => void;
}

export function MapView({ segments, states, highlightIds, places = [], incidents = [], center, zoom = 14, height = 'var(--map-h, 55dvh)', onSelectSegment, onError, onHealthy }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const readyFor = useRef<MapLibreMap | null>(null); // the map instance whose layers are ready
  const pushed = useRef<PushInputs | null>(null);
  const onErr = useRef(onError);
  onErr.current = onError;
  const onOk = useRef(onHealthy);
  onOk.current = onHealthy;
  const onSelect = useRef(onSelectSegment);
  onSelect.current = onSelectSegment;
  const latest = useRef({ segments, states, highlightIds, places, incidents });
  latest.current = { segments, states, highlightIds, places, incidents };

  const push = () => {
    const m = map.current;
    if (!m || readyFor.current !== m) return;
    const l = latest.current;
    const next: PushInputs = { segments: l.segments, states: l.states, highlightIds: l.highlightIds, places: l.places, incidents: l.incidents };
    const need = shouldPush(pushed.current, next);
    try {
      if (need.segments) (m.getSource('segments') as GeoJSONSource).setData(segmentFeatureCollection(l.segments, l.states, l.highlightIds));
      if (need.places) (m.getSource('places') as GeoJSONSource).setData(placePoints(l.places));
      if (need.incidents) (m.getSource('incidents') as GeoJSONSource).setData(incidentPoints(l.incidents));
      pushed.current = next;
    } catch (e) { console.warn('map update failed', e); }
  };

  useEffect(() => {
    const m = new MapLibreMap({ container: el.current!, style: STYLE, center: [center.lng, center.lat], zoom, attributionControl: { compact: true } });
    map.current = m;
    let alive = true; // per-effect: a late event from a removed map cannot affect the next one
    let layersAdded = false;
    pushed.current = null;
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new GeolocateControl({ trackUserLocation: false }), 'top-right');
    let styleLoaded = false;
    const fatal = (msg: string) => { if (alive) onErr.current?.(msg); };
    m.on('error', (e) => {
      const msg = String(e?.error?.message ?? 'map error');
      if (isFatalMapError(e, { styleLoaded })) fatal(msg); else console.debug('map error (ignored)', msg);
    });
    m.on('style.load', () => { styleLoaded = true; });
    m.on('idle', () => { if (alive && layersAdded) onOk.current?.(); });
    const timer = setTimeout(() => { if (!layersAdded) fatal('map layers not ready after 12s'); }, 12_000);
    const addLayers = () => {
      if (!alive || layersAdded || m.getSource('segments')) return;
      try {
      layersAdded = true;
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
      readyFor.current = m;
      push();
      } catch (e) { console.warn('map layers failed', e); fatal(String((e as Error)?.message ?? e)); }
    };
    m.on('style.load', addLayers);
    m.on('load', addLayers);
    return () => { alive = false; clearTimeout(timer); if (readyFor.current === m) readyFor.current = null; m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(push, [segments, states, highlightIds, places, incidents]);
  return <div ref={el} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }} role="region" aria-label="แผนที่สถานะถนน" />;
}
