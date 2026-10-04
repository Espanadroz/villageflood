import { getDeviceId, getNickname, setNickname } from './device';

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
