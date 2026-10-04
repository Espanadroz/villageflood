import { vi } from 'vitest';
import type { Snapshot } from '../data/types';

vi.mock('./derive', () => ({ derive: () => ({ segmentStates: {}, markStates: {}, placeStates: {} }) }));
import { supplyViews } from './supplyViews';

it('falls back to unknown when derive has no state entry for a place', () => {
  const s = { places: [{ id: 'p', name: 'p', category: 'store', geojson: { type: 'Point', coordinates: [100, 13] } }], settings: { origin: { lat: 13, lng: 100 } } } as unknown as Snapshot;
  const v = supplyViews(s, 1, null);
  expect(v[0]!.status).toEqual({ value: 'unknown', asOf: null, conflict: false, basisReportId: null });
});
