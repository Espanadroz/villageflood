import { classifySubmitError, classifyUploadError, classifyRpcFailure, computeAgeSeconds, describeSubmitError, isTooOld } from './submit';

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

describe('report_too_old and expired sessions', () => {
  it('treats report_too_old as permanent with a Thai message', () => {
    expect(classifySubmitError('report_too_old').retryable).toBe(false);
    expect(describeSubmitError('report_too_old')).toBe('รายงานเก่าเกินไป กรุณาถ่ายใหม่แล้วส่งอีกครั้ง');
  });
  it.each(['JWT expired', 'jwt expired', 'PGRST301: JWT expired'])('treats "%s" as retryable', (m) => {
    expect(classifySubmitError(m).retryable).toBe(true);
    expect(classifySubmitError(m, { httpStatus: 401 }).retryable).toBe(true);
  });
});

describe('computeAgeSeconds', () => {
  const NOW = 1_800_000_000_000;
  it('floors the elapsed seconds', () => expect(computeAgeSeconds(NOW - 3_600_999, NOW)).toBe(3600));
  it('is 0 for a fresh item', () => expect(computeAgeSeconds(NOW, NOW)).toBe(0));
  it('never negative (phone clock moved back)', () => expect(computeAgeSeconds(NOW + 60_000, NOW)).toBe(0));
  it('clamps to 24 h', () => expect(computeAgeSeconds(NOW - 5 * 86_400_000, NOW)).toBe(86400));
  it.each([NaN, Infinity, -Infinity, undefined as unknown as number])('non-finite createdAt %s => 0', (c) => expect(computeAgeSeconds(c, NOW)).toBe(0));
  it('non-finite now => 0', () => expect(computeAgeSeconds(NOW, NaN)).toBe(0));
});

describe('isTooOld', () => {
  const NOW = 1_800_000_000_000; const H = 3_600_000;
  const it2 = (kind: string, ageMs: number) => isTooOld({ createdAt: NOW - ageMs, draft: { kind } } as never, NOW);
  it('road older than 3 h is too old', () => { expect(it2('road', 3 * H + 1000)).toBe(true); expect(it2('road', 3 * H - 60_000)).toBe(false); });
  it('water_level older than 2 h is too old', () => { expect(it2('water_level', 2 * H + 1000)).toBe(true); expect(it2('water_level', H)).toBe(false); });
  it('supply older than 12 h is too old', () => { expect(it2('supply', 12 * H + 1000)).toBe(true); expect(it2('supply', 11 * H)).toBe(false); });
  it('general notes never expire client-side', () => expect(it2('general', 100 * H)).toBe(false));
  it('an unknown age (non-finite createdAt) is treated as too old for status kinds', () => {
    expect(isTooOld({ createdAt: NaN, draft: { kind: 'road' } } as never, NOW)).toBe(true);
  });
});
