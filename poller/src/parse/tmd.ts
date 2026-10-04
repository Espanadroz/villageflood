import { XMLParser } from 'fast-xml-parser';
import { WARNING_MAX_AGE_MS } from '../../../src/core/config';
import type { Warning } from '../types';

export function parseTmdCap(xml: string, now: Date): Warning[] {
  const doc = new XMLParser({ ignoreAttributes: true, trimValues: true }).parse(xml);
  const raw = doc?.rss?.channel?.item;
  const items: Array<Record<string, any>> = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: Warning[] = [];
  for (const it of items) {
    if (it?.pubDate == null) continue;
    const issuedAt = new Date(String(it.pubDate));
    if (Number.isNaN(issuedAt.getTime()) || now.getTime() - issuedAt.getTime() > WARNING_MAX_AGE_MS) continue;
    const id = String(it.guid?.['#text'] ?? it.guid ?? it.link ?? '');
    if (!id) continue; // no stable id: skip rather than guess
    const body = String(it.description ?? '');
    out.push({
      id, title: String(it.title ?? ''), body, url: String(it.link ?? ''),
      issuedAt, mentionsBangkok: /กรุงเทพ/.test(body) || /กรุงเทพ/.test(String(it.title ?? '')),
    });
  }
  return out;
}
