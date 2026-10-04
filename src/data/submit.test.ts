import { classifySubmitError, classifyUploadError, describeSubmitError } from './submit';

describe('classifyUploadError', () => {
  it('treats 409 "already exists" as ok-already-exists', () => {
    const result = classifyUploadError({ message: 'The object already exists', statusCode: 409 });
    expect(result === 'ok-already-exists').toBe(true);
  });
  it('treats 409 "duplicate" as ok-already-exists', () => {
    const result = classifyUploadError({ message: 'Duplicate key error: file already exists', statusCode: 409 });
    expect(result === 'ok-already-exists').toBe(true);
  });
  it('treats 503 as retryable SubmitError', () => {
    const result = classifyUploadError({ message: 'Service Unavailable', statusCode: 503 });
    expect(typeof result !== 'string').toBe(true);
    if (typeof result !== 'string') {
      expect(result.retryable).toBe(true);
    }
  });
  it('treats 413 as permanent SubmitError', () => {
    const result = classifyUploadError({ message: 'Payload Too Large', statusCode: 413 });
    if (typeof result !== 'string') {
      expect(result.retryable).toBe(false);
    }
  });
  it('treats network errors as retryable', () => {
    const result = classifyUploadError({ message: 'Failed to fetch' });
    if (typeof result !== 'string') {
      expect(result.retryable).toBe(true);
    }
  });
});

describe('classifySubmitError', () => {
  it.each(['Failed to fetch', 'TypeError: Load failed', 'NetworkError when attempting to fetch resource', 'rate_limited'])(
    'treats "%s" as retryable', (m) => expect(classifySubmitError(m).retryable).toBe(true));
  it.each(['evidence_required', 'invalid_value', 'unknown_target', 'device_blocked', 'committee_only', 'nickname_required', 'invalid_media', 'unknown_report', 'not_a_reporter'])(
    'treats "%s" as permanent', (m) => expect(classifySubmitError(m).retryable).toBe(false));
  it('treats 503 storage error as retryable', () => {
    expect(classifySubmitError('Service Unavailable', 503).retryable).toBe(true);
  });
  it('treats 429 as retryable', () => {
    expect(classifySubmitError('Too Many Requests', 429).retryable).toBe(true);
  });
  it('treats 413 as permanent', () => {
    expect(classifySubmitError('Payload Too Large', 413).retryable).toBe(false);
  });
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
