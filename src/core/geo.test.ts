import { haversineM } from './geo';

it('computes distance between two known gauges (~2.7 km)', () => {
  const d = haversineM({ lat: 13.7771, lng: 100.73883 }, { lat: 13.7699, lng: 100.7149 });
  expect(d).toBeGreaterThan(2650);
  expect(d).toBeLessThan(2760);
});
it('is zero for identical points', () => {
  expect(haversineM({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
});
