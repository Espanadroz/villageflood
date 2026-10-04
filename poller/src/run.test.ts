import { exitCodeFor } from './run';

const ok: PromiseSettledResult<unknown> = { status: 'fulfilled', value: undefined };
const bad: PromiseSettledResult<unknown> = { status: 'rejected', reason: new Error('x') };
// order: bma_canal, bma_rain, thaiwater, tmd_cap, longdo, media_cleanup
it('exit 0 when all ok', () => expect(exitCodeFor([ok, ok, ok, ok, ok, ok])).toBe(0));
it('exit 1 when one source failed', () => expect(exitCodeFor([ok, ok, bad, ok, ok, ok])).toBe(1));
it('exit 0 when only cleanup failed', () => expect(exitCodeFor([ok, ok, ok, ok, ok, bad])).toBe(0));
it('exit 1 when all failed', () => expect(exitCodeFor([bad, bad, bad, bad, bad, bad])).toBe(1));
