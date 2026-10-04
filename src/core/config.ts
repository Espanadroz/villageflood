export const HOUR = 3_600_000;
export const MINUTE = 60_000;

/** Default expiry per report kind. Committee can override via the `settings` table. */
export const TTL_MS = { road: 3 * HOUR, water_level: 2 * HOUR, supply: 12 * HOUR } as const;

/** Agency telemetry older than this is shown as "ข้อมูลเก่า" and never used as current. */
export const AGENCY_MAX_AGE_MS = 60 * MINUTE;
/** TMD warnings older than this are hidden. */
export const WARNING_MAX_AGE_MS = 48 * HOUR;

/** Committee notes at least this old are shown as expired. */
export const COMMITTEE_NOTE_MAX_AGE_MS = 12 * HOUR;

export const MEDIA_RETENTION_DAYS = 30;
export const MAX_VIDEO_SECONDS = 15;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // must match the storage bucket limit
export const FRESH_CAPTURE_MAX_AGE_MS = 5 * MINUTE; // file.lastModified must be this recent

export const GOOGLE_MAPS_MAX_WAYPOINTS = 3;

export const DISCLAIMER_TH = 'ข้อมูลชุมชน ไม่ใช่ประกาศเตือนภัยทางการ';
export const LONGDO_CREDIT_TH = 'ข้อมูลเหตุการณ์: iTIC / Longdo Traffic (CC-BY 4.0)';

/** Placeholder = gauge WL.STN.02. Committee replaces it with the village gate coordinates in Task 14 seed. */
export const VILLAGE_CENTER = { lat: 13.7771, lng: 100.73883 } as const;
export const PRIMARY_GAUGE = 'WL.STN.02';
