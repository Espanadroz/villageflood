import { requiresEvidence } from './evidence';

describe('requiresEvidence', () => {
  it.each(['dry', 'small_car', 'high_clearance'])('road %s needs evidence', (v) => {
    expect(requiresEvidence('road', v)).toBe(true);
  });
  it('road impassable does not', () => expect(requiresEvidence('road', 'impassable')).toBe(false));
  it('water level always needs evidence', () => expect(requiresEvidence('water_level', '2')).toBe(true));
  it('supply and general do not', () => {
    expect(requiresEvidence('supply', 'open')).toBe(false);
    expect(requiresEvidence('general', 'note')).toBe(false);
  });
});
