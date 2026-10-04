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
