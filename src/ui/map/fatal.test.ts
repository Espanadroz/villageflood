import { isFatalMapError } from './fatal';

it('ignores a tile 404 after the style loaded', () =>
  expect(isFatalMapError({ error: { message: 'Failed to fetch tile 404' } }, { styleLoaded: true })).toBe(false));
it('treats an error before the style loaded as fatal', () =>
  expect(isFatalMapError({ error: { message: 'x' } }, { styleLoaded: false })).toBe(true));
it('treats a worker failure as fatal', () =>
  expect(isFatalMapError({ error: { message: 'Worker failed to load. Check that the worker URL is correct.' } }, { styleLoaded: true })).toBe(true));
it('handles events without an error object', () => expect(isFatalMapError({}, { styleLoaded: true })).toBe(false));
