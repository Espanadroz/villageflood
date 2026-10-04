import https from 'node:https';
import { BMA_BASE } from './config';

const UA = { 'user-agent': 'village-flood-portal/1.0 (community project)' };

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

export const fetchBmaCanal = () => json(`${BMA_BASE}/Klongmap/GetDataForUpdate`);
export const fetchBmaRain = () => json(`${BMA_BASE}/rain/PageMap/GetDataForUpdate`, { method: 'POST', body: '' });
export const fetchThaiWater = () => json('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
export const fetchLongdo = () => json('https://event.longdo.com/feed/json');

/** TMD's TLS chain is incomplete (verified 2026-10-04). Public-domain feed, GET only, so verification is skipped for this host alone. */
export function fetchTmdCap(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get('https://www.tmd.go.th/api/xml/CAP', { rejectUnauthorized: false, headers: UA, timeout: 30_000 }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`TMD CAP → HTTP ${res.statusCode}`)); res.resume(); return; }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('TMD CAP timeout')));
  });
}
