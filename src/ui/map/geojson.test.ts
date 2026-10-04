import { segmentFeatureCollection, routeLine } from './geojson';

const segs = [
  { id: 'a', name: 'A', geojson: { type: 'LineString' as const, coordinates: [[100, 13], [100.1, 13.1]] } },
  { id: 'b', name: 'B', geojson: { type: 'LineString' as const, coordinates: [[100.1, 13.1], [100.2, 13.2]] } },
];
it('builds features carrying state, conflict and highlight', () => {
  const fc = segmentFeatureCollection(segs, { a: { value: 'impassable', asOf: 1, conflict: true, basisReportId: 'r' } }, ['b']);
  expect(fc.features[0]!.properties).toEqual({ id: 'a', name: 'A', state: 'impassable', conflict: true, highlight: false });
  expect(fc.features[1]!.properties).toEqual({ id: 'b', name: 'B', state: 'unknown', conflict: false, highlight: true });
});
it('joins a route from its segments in order and skips missing ones', () => {
  const f = routeLine({ id: 'r', name: 'r', destinationId: 'd', segmentIds: ['b', 'zzz', 'a'], waypoints: [], distanceM: 1 }, segs);
  expect(f.geometry.coordinates).toEqual([segs[1]!.geojson.coordinates, segs[0]!.geojson.coordinates]);
});

import { placePoints, incidentPoints, shouldPush } from './geojson';

it('skips segments with missing or non-finite geometry', () => {
  const bad = [
    ...segs,
    { id: 'n', name: 'N', geojson: null },
    { id: 'e', name: 'E', geojson: { type: 'LineString', coordinates: [] } },
    { id: 'f', name: 'F', geojson: { type: 'LineString', coordinates: [[NaN, 1], [2, 3]] } },
  ] as never;
  expect(segmentFeatureCollection(bad, {}).features.map((f) => f.properties.id)).toEqual(['a', 'b']);
});
it('skips places and incidents with missing or non-finite coordinates', () => {
  const places = [
    { id: 'p', name: 'P', category: 'store', geojson: { type: 'Point', coordinates: [100, 13] } },
    { id: 'q', name: 'Q', category: 'store', geojson: null },
    { id: 'r', name: 'R', category: 'store', geojson: { type: 'Point', coordinates: [NaN, 1] } },
  ] as never;
  expect(placePoints(places).features).toHaveLength(1);
  const inc = [
    { id: '1', title: 't', lat: 13, lng: 100, severity: 1, startAt: 0, stopAt: 1 },
    { id: '2', title: 't', lat: NaN, lng: 100, severity: 1, startAt: 0, stopAt: 1 },
  ] as never;
  expect(incidentPoints(inc).features).toHaveLength(1);
});
it('shouldPush reports only the sources whose input reference changed', () => {
  const a = [] as never[], b = [] as never[];
  const prev = { segments: a, states: {}, highlightIds: a, places: a, incidents: a };
  expect(shouldPush(prev, prev)).toEqual({ segments: false, places: false, incidents: false });
  expect(shouldPush(prev, { ...prev, places: b })).toEqual({ segments: false, places: true, incidents: false });
  expect(shouldPush(prev, { ...prev, highlightIds: b })).toEqual({ segments: true, places: false, incidents: false });
  expect(shouldPush(null, prev)).toEqual({ segments: true, places: true, incidents: true });
});
