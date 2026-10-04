import { classifySubmitError, classifyUploadError, classifyRpcFailure, describeSubmitError } from './submit';

describe('classifyUploadError', () => {
  it('treats 409 "already exists" as ok', () => {
    const result = classifyUploadError({ message: 'The object already exists', statusCode: 409 });
    expect(result.ok).toBe(true);
  });
  it('treats 409 "duplicate" as ok', () => {
    const result = classifyUploadError({ message: 'Duplicate key error: file already exists', statusCode: 409 });
    expect(result.ok).toBe(true);
  });
  it('treats 503 statusCode as retryable', () => {
    const result = classifyUploadError({ message: 'Service Unavailable', statusCode: 503 });
    expect(result.ok).toBe(false);
    expect(result.error?.retryable).toBe(true);
  });
  it('treats 413 statusCode as permanent', () => {
    const result = classifyUploadError({ message: 'Payload Too Large', statusCode: 413 });
    expect(result.ok).toBe(false);
    expect(result.error?.retryable).toBe(false);
  });
  it("treats string statusCode '503' as retryable", () => {
    const result = classifyUploadError({ message: 'Service Unavailable', statusCode: '503' });
    expect(result.ok).toBe(false);
    expect(result.error?.retryable).toBe(true);
  });
  it("treats string statusCode '413' as permanent", () => {
    const result = classifyUploadError({ message: 'Payload Too Large', statusCode: '413' });
    expect(result.ok).toBe(false);
    expect(result.error?.retryable).toBe(false);
  });
  it('treats network errors as retryable', () => {
    const result = classifyUploadError({ message: 'Failed to fetch' });
    expect(result.ok).toBe(false);
    expect(result.error?.retryable).toBe(true);
  });
});

describe('classifySubmitError', () => {
  it.each(['Failed to fetch', 'TypeError: Load failed', 'NetworkError when attempting to fetch resource', 'rate_limited'])(
    'treats "%s" as retryable', (m) => expect(classifySubmitError(m).retryable).toBe(true));
  it.each(['evidence_required', 'invalid_value', 'unknown_target', 'device_blocked', 'committee_only', 'nickname_required', 'invalid_media', 'unknown_report', 'not_a_reporter'])(
    'treats "%s" as permanent', (m) => expect(classifySubmitError(m).retryable).toBe(false));
  it('treats real HTTP 503 as retryable', () => {
    expect(classifySubmitError('error', { httpStatus: 503 }).retryable).toBe(true);
  });
  it('treats real HTTP 502 as retryable', () => {
    expect(classifySubmitError('error', { httpStatus: 502 }).retryable).toBe(true);
  });
  it('treats real HTTP 429 as retryable', () => {
    expect(classifySubmitError('error', { httpStatus: 429 }).retryable).toBe(true);
  });
  it('treats rate_limited with no httpStatus as retryable', () => {
    expect(classifySubmitError('rate_limited').retryable).toBe(true);
  });
  it('treats unknown server errors as permanent so a bad item cannot loop forever', () => {
    expect(classifySubmitError('something odd').retryable).toBe(false);
  });
});
describe('classifyRpcFailure', () => {
  it('treats {message:"new row violates…", code:"42501", status:403} as permanent', () => {
    expect(classifyRpcFailure({ error: { message: 'new row violates unique constraint', code: '42501' }, status: 403 }).retryable).toBe(false);
  });
  it('treats {message:"...", code:"23505", status:409} as permanent', () => {
    expect(classifyRpcFailure({ error: { message: 'duplicate key', code: '23505' }, status: 409 }).retryable).toBe(false);
  });
  it('treats {message:"", code:"", status:503} as retryable (httpStatus wins)', () => {
    expect(classifyRpcFailure({ error: { message: '', code: '' }, status: 503 }).retryable).toBe(true);
  });
  it('treats {…, status:502} as retryable', () => {
    expect(classifyRpcFailure({ error: { message: 'x', code: 'ABC' }, status: 502 }).retryable).toBe(true);
  });
  it('treats {…, status:429} as retryable', () => {
    expect(classifyRpcFailure({ error: { message: 'x', code: 'ABC' }, status: 429 }).retryable).toBe(true);
  });
  it('treats {error:{message:"rate_limited", code:"P0001"}, status:400} as retryable (message wins)', () => {
    expect(classifyRpcFailure({ error: { message: 'rate_limited', code: 'P0001' }, status: 400 }).retryable).toBe(true);
  });
  it('treats {error:{message:"device_blocked", code:"P0001"}, status:400} as permanent (message wins)', () => {
    expect(classifyRpcFailure({ error: { message: 'device_blocked', code: 'P0001' }, status: 400 }).retryable).toBe(false);
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
