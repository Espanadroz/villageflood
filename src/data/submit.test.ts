import { classifySubmitError, describeSubmitError } from './submit';

describe('classifySubmitError', () => {
  it.each(['Failed to fetch', 'TypeError: Load failed', 'NetworkError when attempting to fetch resource', 'rate_limited'])(
    'treats "%s" as retryable', (m) => expect(classifySubmitError(m).retryable).toBe(true));
  it.each(['evidence_required', 'invalid_value', 'unknown_target', 'device_blocked', 'committee_only', 'nickname_required', 'invalid_media', 'unknown_report', 'not_a_reporter'])(
    'treats "%s" as permanent', (m) => expect(classifySubmitError(m).retryable).toBe(false));
  it('treats unknown server errors as permanent so a bad item cannot loop forever', () => {
    expect(classifySubmitError('something odd').retryable).toBe(false);
  });
});
describe('describeSubmitError', () => {
  it('gives Thai messages', () => {
    expect(describeSubmitError('device_blocked')).toContain('ถูกระงับ');
    expect(describeSubmitError('rate_limited')).toContain('บ่อยเกินไป');
    expect(describeSubmitError('evidence_required')).toContain('หลักฐาน');
    expect(describeSubmitError('Failed to fetch')).toContain('อินเทอร์เน็ต');
  });
  it('gives message for invalid_media', () => {
    expect(describeSubmitError('invalid_media')).toBe('อัปโหลดหลักฐานไม่สำเร็จ กรุณาถ่ายใหม่แล้วส่งอีกครั้ง');
  });
  it('gives message for unknown_report', () => {
    expect(describeSubmitError('unknown_report')).toBe('ไม่พบรายงานนี้แล้ว');
  });
  it('gives message for not_a_reporter', () => {
    expect(describeSubmitError('not_a_reporter')).toBe('ต้องส่งรายงานอย่างน้อย 1 ครั้งก่อนจึงจะยืนยันรายงานของผู้อื่นได้');
  });
});
