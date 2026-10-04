import type { ReportKind } from '../core/types';
import { supabase } from './supabase';

export interface ReportDraft {
  deviceId: string; nickname: string; kind: ReportKind; targetId: string; value: string;
  lat: number | null; lng: number | null; note: string | null;
}
export interface OutboxItem { id: string; draft: ReportDraft; blob: Blob | null; mediaType: string | null; attempts: number; createdAt: number }

export class SubmitError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); }
}

const PERMANENT = ['evidence_required', 'invalid_value', 'unknown_target', 'device_blocked', 'committee_only', 'nickname_required', 'invalid_media', 'unknown_report', 'not_a_reporter'];

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
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) return new SubmitError(message, true);

  // (c) Anything else => permanent
  return new SubmitError(message, false);
}

export function classifyRpcFailure(res: { error: { message: string; code?: string }; status?: number }): SubmitError {
  return classifySubmitError(res.error.message, { httpStatus: res.status });
}

export function describeSubmitError(message: string): string {
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
  if (item.blob && item.mediaType) {
    mediaPath = `${item.draft.deviceId}/${item.id}.${EXT[item.mediaType] ?? 'bin'}`;
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
    p_client_id: item.id,
  });
  if (res.error) {
    const rpcRes = res as unknown as { error: { message: string; code?: string }; status?: number };
    throw classifyRpcFailure(rpcRes);
  }
}
