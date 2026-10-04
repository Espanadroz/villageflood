// poller/src/run.ts — run once; schedule externally (cron) every 10 minutes.
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import ws from 'ws';
import { MEDIA_RETENTION_DAYS } from '../../src/core/config';
import { deleteExpiredMedia, deleteOrphanMedia } from './cleanup';
import { fetchBmaCanal, fetchBmaRain, fetchLongdo, fetchThaiWater, fetchTmdCap } from './fetch';
import { parseBmaCanal, parseBmaRain } from './parse/bma';
import { parseLongdo } from './parse/longdo';
import { parseThaiWater } from './parse/thaiwater';
import { parseTmdCap } from './parse/tmd';
import { storeIncidents, storeReadings, storeWarnings } from './store';

const SOURCE_JOBS = 5; // the first five jobs are agency sources; the last job is media_cleanup

/** 1 if ANY source job failed (partial outage); otherwise 2 if only media cleanup failed; 0 if all ok. */
export function exitCodeFor(results: PromiseSettledResult<unknown>[]): 0 | 1 | 2 {
  if (results.slice(0, SOURCE_JOBS).some((r) => r.status === 'rejected')) return 1;
  if (results.slice(SOURCE_JOBS).some((r) => r.status === 'rejected')) return 2;
  return 0;
}

export async function runOnce(now = new Date()): Promise<void> {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws as never }, // Node < 22 has no global WebSocket; the poller never subscribes, but the client constructor needs one
  });
  // Each source is independent: one failing source must not stop the others, and failures are logged, not hidden.
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ['bma_canal', async () => storeReadings(db, parseBmaCanal(await fetchBmaCanal(), now))],
    ['bma_rain', async () => storeReadings(db, parseBmaRain(await fetchBmaRain(), now))],
    ['thaiwater', async () => storeReadings(db, parseThaiWater(await fetchThaiWater(), now))],
    ['tmd_cap', async () => storeWarnings(db, parseTmdCap(await fetchTmdCap(), now))],
    ['longdo', async () => storeIncidents(db, parseLongdo(await fetchLongdo(), now))],
    ['media_cleanup', async () => {
      const linked = await deleteExpiredMedia(db, now, MEDIA_RETENTION_DAYS);
      const orphans = await deleteOrphanMedia(db, now, MEDIA_RETENTION_DAYS);
      console.log(`media removed: ${linked} (report-linked), ${orphans} (by object age)`);
    }],
  ];
  const results = await Promise.allSettled(jobs.map(([, fn]) => fn()));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') console.log(`${now.toISOString()} ${jobs[i]![0]}: ok`);
    else console.error(`${now.toISOString()} ${jobs[i]![0]}: FAILED ${(r.reason as Error)?.message ?? String(r.reason)}`);
  });
  process.exitCode = exitCodeFor(results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runOnce();
