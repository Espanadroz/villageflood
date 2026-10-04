import { HOUR, MINUTE } from './config';

const DAY = 24 * HOUR;

export function formatAgeTh(ageMs: number): string {
  if (!Number.isFinite(ageMs)) return 'ไม่ทราบเวลา';
  if (ageMs < MINUTE) return 'เมื่อสักครู่';
  if (ageMs < HOUR) return `${Math.floor(ageMs / MINUTE)} นาทีที่แล้ว`;
  if (ageMs < DAY) return `${Math.floor(ageMs / HOUR)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(ageMs / DAY)} วันที่แล้ว`;
}
