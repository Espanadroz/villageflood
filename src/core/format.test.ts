import { formatAgeTh } from './format';
import { MINUTE, HOUR } from './config';

describe('formatAgeTh', () => {
  it.each([
    [0, 'เมื่อสักครู่'],
    [59_000, 'เมื่อสักครู่'],
    [5 * MINUTE, '5 นาทีที่แล้ว'],
    [59 * MINUTE, '59 นาทีที่แล้ว'],
    [2 * HOUR + 10 * MINUTE, '2 ชั่วโมงที่แล้ว'],
    [26 * HOUR, '1 วันที่แล้ว'],
  ])('%i ms → %s', (ms, text) => expect(formatAgeTh(ms)).toBe(text));
});
