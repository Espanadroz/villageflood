import { validateSegmentGeoJSON, validatePointGeoJSON, validateRouteInput, validateWaterLevels } from './validateContent';

describe('validateSegmentGeoJSON', () => {
  it('accepts a LineString near the village', () =>
    expect(validateSegmentGeoJSON({ type: 'LineString', coordinates: [[100.738, 13.777], [100.74, 13.778]] })).toEqual([]));
  it('rejects non-LineStrings and short lines', () => {
    expect(validateSegmentGeoJSON({ type: 'Point', coordinates: [100, 13] })).toContain('ต้องเป็น LineString');
    expect(validateSegmentGeoJSON({ type: 'LineString', coordinates: [[100.738, 13.777]] })).toContain('ต้องมีอย่างน้อย 2 จุด');
  });
  it('catches swapped lat/lng or far-away coordinates', () => {
    expect(validateSegmentGeoJSON({ type: 'LineString', coordinates: [[13.777, 100.738], [13.778, 100.74]] }).join()).toContain('ไกลจากหมู่บ้าน');
  });
});
describe('validatePointGeoJSON', () => {
  it('accepts a nearby point, rejects others', () => {
    expect(validatePointGeoJSON({ type: 'Point', coordinates: [100.74, 13.78] })).toEqual([]);
    expect(validatePointGeoJSON({ type: 'LineString', coordinates: [] })).toContain('ต้องเป็น Point');
  });
});
describe('validateRouteInput', () => {
  const ok = { segmentIds: ['a', 'b'], waypoints: [{ lat: 13.7, lng: 100.7 }], distanceM: 5000 };
  it('accepts a valid route', () => expect(validateRouteInput(ok, ['a', 'b'])).toEqual([]));
  it('rejects unknown segments, too many waypoints, empty and zero-length routes', () => {
    expect(validateRouteInput(ok, ['a'])).toContain('ไม่พบช่วงถนน: b');
    expect(validateRouteInput({ ...ok, waypoints: Array(4).fill({ lat: 13.7, lng: 100.7 }) }, ['a', 'b'])).toContain('จุดแวะได้ไม่เกิน 3 จุด');
    expect(validateRouteInput({ ...ok, segmentIds: [] }, ['a'])).toContain('ต้องมีอย่างน้อย 1 ช่วงถนน');
    expect(validateRouteInput({ ...ok, distanceM: 0 }, ['a', 'b'])).toContain('ระยะทางต้องมากกว่า 0');
  });
});
describe('validateWaterLevels', () => {
  it('accepts numbered levels with labels', () => expect(validateWaterLevels([{ level: 1, label: 'ขีด 1' }, { level: 2, label: 'ขีด 2' }])).toEqual([]));
  it('rejects empty, duplicate, or unlabeled levels', () => {
    expect(validateWaterLevels([])).toContain('ต้องมีอย่างน้อย 1 ระดับ');
    expect(validateWaterLevels([{ level: 1, label: 'a' }, { level: 1, label: 'b' }])).toContain('หมายเลขระดับซ้ำกัน');
    expect(validateWaterLevels([{ level: 1, label: '' }])).toContain('ทุกระดับต้องมีชื่อ');
  });
});

import { validateContentRow } from './validateContent';
describe('validateContentRow', () => {
  it('requires id and name, rejects swapped segment coords, bad place category, malformed route', () => {
    expect(validateContentRow('segments', { name: 'x' }, [])).toContain('ต้องมี id และ name');
    expect(validateContentRow('segments', { id: 's', name: 'x', geojson: { type: 'LineString', coordinates: [[13.7, 100.7], [13.8, 100.8]] } }, []).join()).toContain('ไกลจากหมู่บ้าน');
    expect(validateContentRow('places', { id: 'p', name: 'x', category: 'zoo', geojson: { type: 'Point', coordinates: [100.74, 13.78] } }, [])).toContain('category ไม่ถูกต้อง');
    expect(validateContentRow('routes', { id: 'r', name: 'x', segment_ids: 'a', distance_m: 1 }, ['a'])).toHaveLength(1);
    expect(validateContentRow('destinations', { id: 'd', name: 'x', lat: 1, lng: 2 }, [])).toEqual([]);
  });
});

describe('validateContentRow: valid rows and strict types', () => {
  const line = { type: 'LineString', coordinates: [[100.738, 13.777], [100.74, 13.778]] };
  const pt = { type: 'Point', coordinates: [100.74, 13.78] };
  const route = { id: 'r', name: 'x', segment_ids: ['a'], waypoints: [{ lat: 13.7, lng: 100.7 }], distance_m: 5000 };
  it('accepts valid segments, places, routes and water_marks', () => {
    expect(validateContentRow('segments', { id: 's', name: 'x', geojson: line }, [])).toEqual([]);
    expect(validateContentRow('places', { id: 'p', name: 'x', category: 'store', geojson: pt }, [])).toEqual([]);
    expect(validateContentRow('routes', route, ['a'])).toEqual([]);
    expect(validateContentRow('water_marks', { id: 'm', name: 'x', geojson: pt, levels: [{ level: 1, label: 'a' }] }, [])).toEqual([]);
  });
  it('rejects bad water_marks levels and point', () => {
    expect(validateContentRow('water_marks', { id: 'm', name: 'x', geojson: pt, levels: [] }, [])).toContain('ต้องมีอย่างน้อย 1 ระดับ');
    expect(validateContentRow('water_marks', { id: 'm', name: 'x', geojson: { type: 'Point', coordinates: [13.7, 100.7] }, levels: [{ level: 1, label: 'a' }] }, []).join()).toContain('ไกลจากหมู่บ้าน');
  });
  it('rejects malformed route element types and string distance', () => {
    expect(validateContentRow('routes', { ...route, segment_ids: [1] }, ['a'])).not.toEqual([]);
    expect(validateContentRow('routes', { ...route, waypoints: [{ lat: 'x', lng: 1 }] }, ['a'])).not.toEqual([]);
    expect(validateContentRow('routes', { ...route, waypoints: [null] }, ['a'])).not.toEqual([]);
    expect(validateContentRow('routes', { ...route, distance_m: '5000' }, ['a'])).not.toEqual([]);
  });
});
