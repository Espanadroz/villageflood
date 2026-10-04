// poller/src/run.ts — run once; schedule externally (cron) every 10 minutes.
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { MEDIA_RETENTION_DAYS } from '../../src/core/config';
import { deleteExpiredMedia } from './cleanup';
import { fetchBmaCanal, fetchBmaRain, fetchLongdo, fetchThaiWater, fetchTmdCap } from './fetch';
import { parseBmaCanal, parseBmaRain } from './parse/bma';
import { parseLongdo } from './parse/longdo';
import { parseThaiWater } from './parse/thaiwater';
import { parseTmdCap } from './parse/tmd';
import { storeIncidents, storeReadings, storeWarnings } from './store';

export async function runOnce(now = new Date()): Promise<void> {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws as never }, // Node < 22 has no global WebSocket; the poller never subscribes, but the client constructor needs one
  });
  // Each source is independent: one failing source must not stop the others, and failures are logged, not hidden.
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ['bma_canal', async () => storeReadings(db, parseBmaCanal(await fetchBmaCanal()))],
    ['bma_rain', async () => storeReadings(db, parseBmaRain(await fetchBmaRain()))],
    ['thaiwater', async () => storeReadings(db, parseThaiWater(await fetchThaiWater()))],
    ['tmd_cap', async () => storeWarnings(db, parseTmdCap(await fetchTmdCap(), now))],
    ['longdo', async () => storeIncidents(db, parseLongdo(await fetchLongdo(), now))],
    ['media_cleanup', async () => console.log(`media removed: ${await deleteExpiredMedia(db, now, MEDIA_RETENTION_DAYS)}`)],
  ];
  const results = await Promise.allSettled(jobs.map(([, fn]) => fn()));
  results.forEach((r, i) => console.log(`${now.toISOString()} ${jobs[i]![0]}: ${r.status === 'fulfilled' ? 'ok' : `FAILED ${(r.reason as Error).message}`}`));
  if (results.every((r) => r.status === 'rejected')) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await runOnce();
