import { computeServerOffset, effectiveNow } from './clock';

describe('computeServerOffset', () => {
  it('returns a finite offset for a valid ISO time', () => {
    const off = computeServerOffset('2026-10-04T07:00:00Z', Date.parse('2026-10-04T06:59:00Z'));
    expect(off).toBe(60_000);
  });
  it.each([null, undefined, 'garbage', '', 123])('throws for %p', (v) => {
    expect(() => computeServerOffset(v, 1)).toThrow();
  });
});

describe('effectiveNow', () => {
  it('verified applies the offset in both directions', () => {
    expect(effectiveNow(1000, 500, true)).toBe(1500);
    expect(effectiveNow(1000, -500, true)).toBe(500);
  });
  it('unverified with negative offset returns raw', () => {
    expect(effectiveNow(1000, -500, false)).toBe(1000);
  });
  it('unverified with positive offset returns raw+offset', () => {
    expect(effectiveNow(1000, 500, false)).toBe(1500);
  });
  it('treats non-finite offset as 0', () => {
    expect(effectiveNow(1000, NaN, true)).toBe(1000);
    expect(effectiveNow(1000, NaN, false)).toBe(1000);
    expect(effectiveNow(1000, Infinity, false)).toBe(1000);
  });
});
