import { TTL_MS } from '../core/config';
import type { ReportKind } from '../core/types';
import { getUploadKey } from './device';
import { supabase } from './supabase';

export interface ReportDraft {
  deviceId: string; nickname: string; kind: ReportKind; targetId: string; value: string;
  lat: number | null; lng: number | null; note: string | null;
}
export interface OutboxItem {
  id: string; draft: ReportDraft; blob: Blob | null; mediaType: string | null; attempts: number;
  /** Phone-clock time of the observation (capture/submit). Only ever used as an age against the same clock. */
  createdAt: number;
  /** Storage folder key captured when the item was created (falls back to getUploadKey()). Never the device id. */
  uploadKey?: string;
  /** While Date.now() < holdUntil the item is waiting for a location fix and flush skips it. */
  holdUntil?: number;
}

export const MAX_AGE_SECONDS = 86_400;

/** Seconds since the observation, from the same phone clock (so clock skew cancels); clamped to [0, 86400]. */
export function computeAgeSeconds(createdAt: number, now: number): number {
  const s = Math.floor((now - createdAt) / 1000);
  if (!Number.isFinite(s)) return 0;
  return Math.min(Math.max(s, 0), MAX_AGE_SECONDS);
}

/** A status report older than its kind's (default) TTL would already be expired: never send it as current. */
export function isTooOld(item: Pick<OutboxItem, 'createdAt' | 'draft'>, now: number): boolean {
  const kind = item.draft.kind;
  if (kind !== 'road' && kind !== 'water_level' && kind !== 'supply') return false;
  if (!Number.isFinite(item.createdAt) || !Number.isFinite(now)) return true; // unknown age: fail closed, never send as fresh
  return now - item.createdAt >= TTL_MS[kind];
}

export class SubmitError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); }
}

const PERMANENT = ['report_too_old', 'evidence_required', 'invalid_value', 'unknown_target', 'device_blocked', 'committee_only', 'nickname_required', 'invalid_media', 'unknown_report', 'not_a_reporter'];

export function classifyUploadError(err: { message: string; statusCode?: string | number }): { ok: boolean; error?: SubmitError } {
  const code = typeof err.statusCode === 'string' ? parseInt(err.statusCode) : err.statusCode;
  if (code === 409 && /already exists|duplicate/i.test(err.message)) return { ok: true };
  return { ok: false, error: classifySubmitError(err.message, { httpStatus: code }) };
}

export function classifySubmitError(message: string, opts?: { httpStatus?: number }): SubmitError {
  const httpStatus = typeof opts?.httpStatus === 'number' && isFinite(opts.httpStatus) ? opts.httpStatus : undefined;

  // (a) Check HTTP status first: 5xx or 429 => retryable
  if (httpStatus && (httpStatus >= 500 || httpStatus === 429)) {
    return new SubmitError(message, true);
  }

  // (b) Check message for patterns (NEVER use error.code/SQLSTATE)
  if (PERMANENT.some((c) => message.includes(c))) return new SubmitError(message, false);
  if (message.includes('rate_limited')) return new SubmitError(message, true);
  if (/jwt expired/i.test(message)) return new SubmitError(message, true); // session refreshes; retry later
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) return new SubmitError(message, true);

  // (c) Anything else => permanent
  return new SubmitError(message, false);
}

export function classifyRpcFailure(res: { error: { message: string; code?: string }; status?: number }): SubmitError {
  return classifySubmitError(res.error.message, { httpStatus: res.status });
}

export function describeSubmitError(message: string): string {
  if (message.includes('report_too_old')) return 'รายงานเก่าเกินไป กรุณาถ่ายใหม่แล้วส่งอีกครั้ง';
  if (message.includes('device_blocked')) return 'อุปกรณ์นี้ถูกระงับการรายงาน กรุณาติดต่อกรรมการ';
  if (message.includes('rate_limited')) return 'ส่งรายงานบ่อยเกินไป กรุณารอสักครู่';
  if (message.includes('evidence_required')) return 'ต้องแนบรูปหรือวิดีโอเป็นหลักฐาน';
  if (message.includes('committee_only')) return 'เฉพาะกรรมการเท่านั้น';
  if (message.includes('nickname_required')) return 'กรุณาใส่ชื่อเล่น';
  if (message.includes('invalid_media')) return 'อัปโหลดหลักฐานไม่สำเร็จ กรุณาถ่ายใหม่แล้วส่งอีกครั้ง';
  if (message.includes('unknown_report')) return 'ไม่พบรายงานนี้แล้ว';
  if (message.includes('not_a_reporter')) return 'ต้องส่งรายงานอย่างน้อย 1 ครั้งก่อนจึงจะยืนยันรายงานของผู้อื่นได้';
  if (message.includes('invalid_value') || message.includes('unknown_target')) return 'ข้อมูลที่ส่งไม่ถูกต้อง';
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) return 'ไม่มีอินเทอร์เน็ต — เก็บรายงานไว้ในเครื่อง จะส่งให้อัตโนมัติเมื่อเชื่อมต่อได้';
  return 'ส่งรายงานไม่สำเร็จ';
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

export async function sendItem(item: OutboxItem): Promise<void> {
  let mediaPath: string | null = null;
  let uploadKey: string | null = null;
  if (item.blob && item.mediaType) {
    uploadKey = item.uploadKey ?? getUploadKey();
    mediaPath = `${uploadKey}/${item.id}.${EXT[item.mediaType] ?? 'bin'}`; // never the device id (it is the submit credential)
    const res = await supabase.storage.from('evidence').upload(mediaPath, item.blob, { contentType: item.mediaType, upsert: false });
    if (res.error) {
      const err = res.error as unknown as { message: string; statusCode?: string | number };
      const classErr = classifyUploadError({ message: err.message, statusCode: err.statusCode });
      if (!classErr.ok && classErr.error) throw classErr.error;
    }
  }
  const d = item.draft;
  const res = await supabase.rpc('submit_report', {
    p_device: d.deviceId, p_nickname: d.nickname, p_kind: d.kind, p_target: d.targetId, p_value: d.value,
    p_lat: d.lat, p_lng: d.lng, p_media_path: mediaPath, p_media_type: item.mediaType, p_note: d.note,
    p_client_id: item.id, p_upload_key: uploadKey,
    p_age_seconds: computeAgeSeconds(item.createdAt, Date.now()),
  });
  if (res.error) {
    const rpcRes = res as unknown as { error: { message: string; code?: string }; status?: number };
    throw classifyRpcFailure(rpcRes);
  }
}
