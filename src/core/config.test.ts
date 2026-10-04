import { TTL_MS, HOUR, MEDIA_RETENTION_DAYS, GOOGLE_MAPS_MAX_WAYPOINTS, DISCLAIMER_TH, PRIMARY_GAUGE, COMMITTEE_NOTE_MAX_AGE_MS } from './config';

it('committee note max age is 12h', () => { expect(COMMITTEE_NOTE_MAX_AGE_MS).toBe(12 * HOUR); });

describe('spec constants', () => {
  it('uses the agreed default TTLs', () => {
    expect(TTL_MS.road).toBe(3 * HOUR);
    expect(TTL_MS.water_level).toBe(2 * HOUR);
    expect(TTL_MS.supply).toBe(12 * HOUR);
  });
  it('matches other spec constants', () => {
    expect(MEDIA_RETENTION_DAYS).toBe(30);
    expect(GOOGLE_MAPS_MAX_WAYPOINTS).toBe(3);
    expect(DISCLAIMER_TH).toBe('ข้อมูลชุมชน ไม่ใช่ประกาศเตือนภัยทางการ');
    expect(PRIMARY_GAUGE).toBe('WL.STN.02');
  });
});
