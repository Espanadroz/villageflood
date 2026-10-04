import { getDeviceId, getNickname, getUploadKey, setNickname } from './device';

beforeEach(() => localStorage.clear());
it('creates a device id once and keeps it', () => {
  const a = getDeviceId();
  expect(a).toMatch(/^[0-9a-f-]{36}$/);
  expect(getDeviceId()).toBe(a);
});
it('stores the nickname', () => {
  expect(getNickname()).toBe('');
  setNickname('  สมศรี ');
  expect(getNickname()).toBe('สมศรี');
});
it('creates a separate upload key once and keeps it', () => {
  const k = getUploadKey();
  expect(k).toMatch(/^[0-9a-f-]{36}$/);
  expect(getUploadKey()).toBe(k);
  expect(k).not.toBe(getDeviceId());
});
it('falls back to a stable in-memory upload key when localStorage throws', () => {
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const a = getUploadKey();
  expect(a).toMatch(/^[0-9a-f-]{36}$/);
  expect(getUploadKey()).toBe(a);
  expect(a).not.toBe(getDeviceId());
  spy.mockRestore();
});
