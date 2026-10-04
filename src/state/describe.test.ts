import { describeFeedItem } from './describe';
import type { FeedItem, Snapshot } from '../data/types';

const s = {
  segments: [{ id: 'seg1', name: 'ซอย 1' }],
  marks: [{ id: 'm1', name: 'กำแพงริมคลอง', levels: [{ level: 2, label: 'ขีดที่ 2' }] }],
  places: [{ id: 'p1', name: 'ร้านป้าแดง' }],
} as unknown as Snapshot;
const item = (o: Partial<FeedItem>): FeedItem => ({
  id: 'x', kind: 'road', targetId: 'seg1', value: 'small_car', nickname: 'n', createdAt: 0, mediaUrl: null, mediaType: null,
  note: null, byCommittee: false, confirmedByCommittee: false, confirmations: 0, locationOk: true, ...o,
});

it('describes a road report', () => expect(describeFeedItem(item({}), s)).toEqual({ target: 'ซอย 1', valueLabel: 'รถเล็กไปได้' }));
it('describes a water level via the mark label', () =>
  expect(describeFeedItem(item({ kind: 'water_level', targetId: 'm1', value: '2' }), s)).toEqual({ target: 'กำแพงริมคลอง', valueLabel: 'ขีดที่ 2' }));
it('describes supply', () =>
  expect(describeFeedItem(item({ kind: 'supply', targetId: 'p1', value: 'out_of_stock' }), s)).toEqual({ target: 'ร้านป้าแดง', valueLabel: 'ของหมด' }));
it('uses the note text for general messages and names committee targets', () => {
  expect(describeFeedItem(item({ kind: 'general', targetId: 'wall', value: 'note', note: 'น้ำใกล้ล้น' }), s)).toEqual({ target: 'กำแพงริมคลอง', valueLabel: 'น้ำใกล้ล้น' });
  expect(describeFeedItem(item({ kind: 'general', targetId: 'drainage', value: 'note', note: 'เปิดเครื่องสูบ' }), s).target).toBe('การระบายน้ำ');
  expect(describeFeedItem(item({ kind: 'general', targetId: 'village', value: 'note', note: 'ทดสอบ' }), s).target).toBe('ทั่วไป');
});
it('falls back gracefully for unknown targets', () => expect(describeFeedItem(item({ targetId: 'gone' }), s).target).toBe('(จุดที่ถูกลบ)'));
