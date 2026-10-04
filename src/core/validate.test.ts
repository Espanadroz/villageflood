import { validateDraft } from './validate';

const ok = { kind: 'road' as const, targetId: 'seg1', value: 'impassable', nickname: 'สมชาย', hasEvidence: false, note: '' };
it('accepts impassable without evidence', () => expect(validateDraft(ok)).toEqual([]));
it('rejects a passable claim without evidence', () => {
  expect(validateDraft({ ...ok, value: 'small_car' })).toContain('ต้องแนบรูปหรือวิดีโอที่ถ่ายใหม่เป็นหลักฐาน');
});
it('rejects water level without evidence', () => {
  expect(validateDraft({ ...ok, kind: 'water_level', value: '2' })).toContain('ต้องแนบรูปหรือวิดีโอที่ถ่ายใหม่เป็นหลักฐาน');
});
it('accepts evidenced passable claim', () => expect(validateDraft({ ...ok, value: 'dry', hasEvidence: true })).toEqual([]));
it('requires nickname, target and value', () => {
  const errs = validateDraft({ ...ok, nickname: ' ', targetId: '', value: '' });
  expect(errs).toEqual(expect.arrayContaining(['กรุณาใส่ชื่อเล่น', 'กรุณาเลือกจุดที่รายงาน', 'กรุณาเลือกสถานะ']));
});
it('requires text for general notes', () => {
  expect(validateDraft({ ...ok, kind: 'general', targetId: 'village', value: 'note', note: '' })).toContain('กรุณาพิมพ์ข้อความ');
});
