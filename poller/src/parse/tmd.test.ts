import { parseTmdCap } from './tmd';

const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>ฝนตกหนัก</title><link>https://www.tmd.go.th/uploads/CAP/CAPTMD20261003165356_2.xml</link>
<description>ประเทศไทยตอนบนมีฝนตกหนัก ส่งผลกระทบกับภาคกลาง รวมทั้งกรุงเทพมหานครและปริมณฑล</description>
<guid isPermaLink="false">TMD20261003165356_2</guid><pubDate>Sat, 03 Oct 2026 22:50:00 +0700</pubDate></item>
<item><title>เตือนเก่า</title><link>https://x/old.xml</link><description>เก่า</description>
<guid isPermaLink="false">TMD-OLD</guid><pubDate>Sat, 26 Sep 2026 10:00:00 +0700</pubDate></item>
</channel></rss>`;

const NOW = new Date('2026-10-04T10:00:00Z');
it('parses items, flags Bangkok mentions, and drops items older than 48 hours', () => {
  const out = parseTmdCap(xml, NOW);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ id: 'TMD20261003165356_2', title: 'ฝนตกหนัก', mentionsBangkok: true });
  expect(out[0]!.issuedAt.toISOString()).toBe('2026-10-03T15:50:00.000Z');
});
it('handles a feed with a single item and with none', () => {
  expect(parseTmdCap('<rss><channel></channel></rss>', NOW)).toEqual([]);
  expect(parseTmdCap(xml.replace(/<item>[\s\S]*?<\/item>(?=\s*<item>)/, ''), NOW)).toEqual([]);
});

it('skips items with a missing or invalid pubDate', () => {
  const x = `<rss><channel><item><title>a</title><link>l</link><guid>g1</guid></item><item><title>b</title><link>l</link><guid>g2</guid><pubDate>not a date</pubDate></item></channel></rss>`;
  expect(parseTmdCap(x, NOW)).toEqual([]);
});
