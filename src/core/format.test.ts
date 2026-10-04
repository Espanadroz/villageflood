import { formatAgeTh } from './format';
import { MINUTE, HOUR } from './config';

describe('formatAgeTh', () => {
  it.each([
    [0, 'เมื่อสักครู่'],
    [59_000, 'เมื่อสักครู่'],
    [60_000, '1 นาทีที่แล้ว'],
    [5 * MINUTE, '5 นาทีที่แล้ว'],
    [59 * MINUTE, '59 นาทีที่แล้ว'],
    [59 * MINUTE + 59_000, '59 นาทีที่แล้ว'],
    [HOUR, '1 ชั่วโมงที่แล้ว'],
    [2 * HOUR + 10 * MINUTE, '2 ชั่วโมงที่แล้ว'],
    [24 * HOUR, '1 วันที่แล้ว'],
    [26 * HOUR, '1 วันที่แล้ว'],
  ])('%i ms → %s', (ms, text) => expect(formatAgeTh(ms)).toBe(text));
  it('returns ไม่ทราบเวลา for NaN', () => expect(formatAgeTh(NaN)).toBe('ไม่ทราบเวลา'));
  it('returns ไม่ทราบเวลา for Infinity', () => expect(formatAgeTh(Number.POSITIVE_INFINITY)).toBe('ไม่ทราบเวลา'));
  it('returns ไม่ทราบเวลา for -Infinity', () => expect(formatAgeTh(Number.NEGATIVE_INFINITY)).toBe('ไม่ทราบเวลา'));
  it('returns เมื่อสักครู่ for negative (clock skew)', () => expect(formatAgeTh(-1000)).toBe('เมื่อสักครู่'));
});
