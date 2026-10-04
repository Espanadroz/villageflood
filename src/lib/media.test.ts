import { isFreshCapture, fitWithin } from './media';

const NOW = 1_000_000_000_000;
describe('isFreshCapture', () => {
  it('accepts a file captured moments ago', () => expect(isFreshCapture({ lastModified: NOW - 20_000 }, NOW)).toBe(true));
  it('rejects a gallery file from yesterday', () => expect(isFreshCapture({ lastModified: NOW - 86_400_000 }, NOW)).toBe(false));
  it('rejects a file dated in the future by more than a minute', () => expect(isFreshCapture({ lastModified: NOW + 120_000 }, NOW)).toBe(false));
});
describe('fitWithin', () => {
  it('keeps small images', () => expect(fitWithin(800, 600, 1280)).toEqual({ w: 800, h: 600 }));
  it('scales landscape by the long side', () => expect(fitWithin(4000, 3000, 1280)).toEqual({ w: 1280, h: 960 }));
  it('scales portrait by the long side', () => expect(fitWithin(3000, 4000, 1280)).toEqual({ w: 960, h: 1280 }));
});
