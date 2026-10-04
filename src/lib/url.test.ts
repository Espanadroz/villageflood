import { safeHttpUrl } from './url';

describe('safeHttpUrl', () => {
  it('allows http and https', () => {
    expect(safeHttpUrl('https://tmd.go.th/x')).toBe('https://tmd.go.th/x');
    expect(safeHttpUrl('http://tmd.go.th/x')).toBe('http://tmd.go.th/x');
  });
  it.each(['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil', '/relative', 'garbage', '', ' javascript:alert(1)'])('rejects %s', (u) => {
    expect(safeHttpUrl(u)).toBeNull();
  });
  it.each([null, undefined, 5, {}, []])('rejects non-string %j', (u) => { expect(safeHttpUrl(u)).toBeNull(); });
});
