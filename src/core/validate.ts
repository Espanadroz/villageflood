import { requiresEvidence } from './evidence';
import type { ReportKind } from './types';

export interface DraftInput { kind: ReportKind; targetId: string; value: string; nickname: string; hasEvidence: boolean; note: string }

export function validateDraft(d: DraftInput): string[] {
  const errs: string[] = [];
  if (!d.nickname.trim()) errs.push('กรุณาใส่ชื่อเล่น');
  if (!d.targetId) errs.push('กรุณาเลือกจุดที่รายงาน');
  if (!d.value) errs.push('กรุณาเลือกสถานะ');
  if (d.kind === 'general' && !d.note.trim()) errs.push('กรุณาพิมพ์ข้อความ');
  if (d.value && requiresEvidence(d.kind, d.value) && !d.hasEvidence) errs.push('ต้องแนบรูปหรือวิดีโอที่ถ่ายใหม่เป็นหลักฐาน');
  return errs;
}
