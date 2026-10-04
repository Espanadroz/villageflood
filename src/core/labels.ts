import type { SegmentState, SupplyStatus, VehicleClass } from './types';
import type { Trend } from './agency';

export const STATUS_LABEL_TH: Record<SegmentState, string> = {
  dry: 'แห้ง', small_car: 'รถเล็กไปได้', high_clearance: 'รถยกสูงเท่านั้น', impassable: 'ผ่านไม่ได้', unknown: 'ไม่ทราบ',
};
export const STATUS_COLOR: Record<SegmentState, string> = {
  dry: '#1a9850', small_car: '#7fbf3f', high_clearance: '#f2a900', impassable: '#d73027', unknown: '#8a8f98',
};
export const VEHICLE_LABEL_TH: Record<VehicleClass, string> = { small_car: 'รถเล็ก', high_clearance: 'รถยกสูง' };
export const SUPPLY_LABEL_TH: Record<SupplyStatus | 'unknown', string> = {
  open: 'เปิด', closed: 'ปิด', out_of_stock: 'ของหมด', unreachable: 'เข้าถึงไม่ได้', unknown: 'ไม่ทราบ',
};
export const TREND_LABEL_TH: Record<Trend, string> = { rising: 'กำลังขึ้น', falling: 'กำลังลง', steady: 'ทรงตัว', unknown: 'ยังไม่พอประเมินแนวโน้ม' };
