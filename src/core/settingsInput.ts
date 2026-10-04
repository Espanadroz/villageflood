import { HOUR } from './config';
import { haversineM } from './geo';
import { MAX_FROM_VILLAGE_M } from './validateContent';
import { VILLAGE_CENTER } from './config';

export interface SettingsInput { roadH: string; waterH: string; supplyH: string; agencyMin: string; watch: string; danger: string; origin: string }
type Thresholds = Record<string, { watch: number; danger: number }>;

const num = (s: string): number => (s.trim() === '' ? NaN : Number(s));
const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;

function parseOrigin(s: string): { lat: number; lng: number } | null {
  const parts = s.split(',');
  if (parts.length !== 2) return null;
  const lat = num(parts[0]!); const lng = num(parts[1]!);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function validateSettingsInput(i: SettingsInput): string[] {
  const errs: string[] = [];
  const ttl = (v: string, label: string) => { if (!inRange(num(v), 0.25, 168)) errs.push(`${label} ต้องเป็นตัวเลข 0.25–168 ชั่วโมง`); };
  ttl(i.roadH, 'อายุสถานะถนน'); ttl(i.waterH, 'อายุระดับน้ำ'); ttl(i.supplyH, 'อายุสถานะจุดเสบียง');
  if (!inRange(num(i.agencyMin), 5, 1440)) errs.push('เวลาข้อมูลหน่วยงานเก่า ต้องเป็นตัวเลข 5–1440 นาที');
  const w = i.watch.trim(); const d = i.danger.trim();
  if (w !== '' || d !== '') {
    const wn = num(w); const dn = num(d);
    if (!Number.isFinite(wn) || !Number.isFinite(dn)) errs.push('เกณฑ์เตือนเกจต้องกรอกเป็นตัวเลขทั้งสองช่อง (หรือเว้นว่างทั้งคู่)');
    else if (!(wn < dn)) errs.push('เกณฑ์เฝ้าระวังต้องน้อยกว่าเกณฑ์อันตราย');
  }
  const o = parseOrigin(i.origin);
  if (!o) errs.push('พิกัดทางออกต้องเป็น "lat, lng" ที่เป็นตัวเลขทั้งสองส่วน');
  else if (!inRange(o.lat, -90, 90) || !inRange(o.lng, -180, 180)) errs.push('พิกัดทางออกอยู่นอกช่วง (lat -90..90, lng -180..180)');
  else if (haversineM(VILLAGE_CENTER, o) > MAX_FROM_VILLAGE_M) errs.push('พิกัดทางออกไกลจากหมู่บ้านเกิน 30 กม. (ตรวจว่าไม่ได้สลับ lat/lng)');
  return errs;
}

/** Call only after validateSettingsInput returned no errors. Values are stored in ms. */
export function buildSettingsRows(i: SettingsInput, current: Thresholds): { key: string; value: unknown }[] {
  const th: Thresholds = { ...current };
  if (i.watch.trim() === '' && i.danger.trim() === '') delete th['WL.STN.02'];
  else th['WL.STN.02'] = { watch: Number(i.watch), danger: Number(i.danger) };
  const o = parseOrigin(i.origin)!;
  return [
    { key: 'ttl_ms', value: { road: Number(i.roadH) * HOUR, water_level: Number(i.waterH) * HOUR, supply: Number(i.supplyH) * HOUR } },
    { key: 'agency_max_age_ms', value: Number(i.agencyMin) * 60_000 },
    { key: 'gauge_thresholds', value: th },
    { key: 'origin', value: { lat: o.lat, lng: o.lng } },
  ];
}
