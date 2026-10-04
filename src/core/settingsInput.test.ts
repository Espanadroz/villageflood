import { buildSettingsRows, validateSettingsInput, type SettingsInput } from './settingsInput';

const ok: SettingsInput = { roadH: '3', waterH: '2', supplyH: '12', agencyMin: '60', watch: '5', danger: '8', origin: '13.7771, 100.73883' };
const bad = (patch: Partial<SettingsInput>) => validateSettingsInput({ ...ok, ...patch });

describe('validateSettingsInput', () => {
  it('accepts a valid input', () => expect(validateSettingsInput(ok)).toEqual([]));
  it('TTL boundaries: 0.24 invalid, 0.25 ok, 168 ok, 169 invalid', () => {
    expect(bad({ roadH: '0.24' })).not.toEqual([]);
    expect(bad({ roadH: '0.25' })).toEqual([]);
    expect(bad({ waterH: '168' })).toEqual([]);
    expect(bad({ supplyH: '169' })).not.toEqual([]);
  });
  it('empty or NaN numeric fields are errors, not 0', () => {
    expect(bad({ roadH: '' })).not.toEqual([]);
    expect(bad({ agencyMin: 'abc' })).not.toEqual([]);
    expect(bad({ agencyMin: '4' })).not.toEqual([]);
    expect(bad({ agencyMin: '1440' })).toEqual([]);
    expect(bad({ agencyMin: '1441' })).not.toEqual([]);
  });
  it('rejects reversed, equal and non-numeric thresholds', () => {
    expect(bad({ watch: '8', danger: '5' })).toContain('เกณฑ์เฝ้าระวังต้องน้อยกว่าเกณฑ์อันตราย');
    expect(bad({ watch: '5', danger: '5' })).toContain('เกณฑ์เฝ้าระวังต้องน้อยกว่าเกณฑ์อันตราย');
    expect(bad({ watch: 'abc', danger: '5' })).not.toEqual([]);
    expect(bad({ watch: '5', danger: '' })).not.toEqual([]);
  });
  it('both thresholds empty is valid', () => expect(bad({ watch: '', danger: '' })).toEqual([]));
  it('origin: empty part, single part, far away, out of range', () => {
    expect(bad({ origin: '13.77, ' })).not.toEqual([]);
    expect(bad({ origin: '13.77' })).not.toEqual([]);
    expect(bad({ origin: '' })).not.toEqual([]);
    expect(bad({ origin: '100.73883, 13.7771' })).not.toEqual([]);
    expect(bad({ origin: '95, 100' })).not.toEqual([]);
    expect(bad({ origin: '13.7, 200' })).not.toEqual([]);
  });
});

describe('buildSettingsRows', () => {
  it('builds rows in ms with the origin and thresholds', () => {
    const rows = buildSettingsRows(ok, { 'WL.OTHER': { watch: 1, danger: 2 } });
    expect(rows).toEqual([
      { key: 'ttl_ms', value: { road: 3 * 3_600_000, water_level: 2 * 3_600_000, supply: 12 * 3_600_000 } },
      { key: 'agency_max_age_ms', value: 3_600_000 },
      { key: 'gauge_thresholds', value: { 'WL.OTHER': { watch: 1, danger: 2 }, 'WL.STN.02': { watch: 5, danger: 8 } } },
      { key: 'origin', value: { lat: 13.7771, lng: 100.73883 } },
    ]);
  });
  it('removes the WL.STN.02 entry when both thresholds are empty', () => {
    const rows = buildSettingsRows({ ...ok, watch: '', danger: '' }, { 'WL.STN.02': { watch: 1, danger: 2 }, X: { watch: 3, danger: 4 } });
    expect(rows.find((r) => r.key === 'gauge_thresholds')!.value).toEqual({ X: { watch: 3, danger: 4 } });
  });
});
