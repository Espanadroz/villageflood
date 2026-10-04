import { STATUS_LABEL_TH, STATUS_COLOR } from './labels';

const ALL = ['dry', 'small_car', 'high_clearance', 'impassable', 'unknown'] as const;

it('labels all five states in Thai exactly as specified', () => {
  expect(STATUS_LABEL_TH).toEqual({ dry: 'แห้ง', small_car: 'รถเล็กไปได้', high_clearance: 'รถยกสูงเท่านั้น', impassable: 'ผ่านไม่ได้', unknown: 'ไม่ทราบ' });
});
it('gives each state a distinct colour so unknown is never mistaken for dry', () => {
  expect(new Set(ALL.map((s) => STATUS_COLOR[s])).size).toBe(5);
});
