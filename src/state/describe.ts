import { STATUS_LABEL_TH, SUPPLY_LABEL_TH } from '../core/labels';
import type { RoadStatus, SupplyStatus } from '../core/types';
import type { FeedItem, Snapshot } from '../data/types';

const GENERAL_TARGETS: Record<string, string> = { village: 'ทั่วไป', wall: 'กำแพงริมคลอง', drainage: 'การระบายน้ำ' };

export function describeFeedItem(item: FeedItem, s: Snapshot): { target: string; valueLabel: string } {
  const missing = '(จุดที่ถูกลบ)';
  if (item.kind === 'road') return { target: s.segments.find((x) => x.id === item.targetId)?.name ?? missing, valueLabel: STATUS_LABEL_TH[item.value as RoadStatus] ?? item.value };
  if (item.kind === 'supply') return { target: s.places.find((x) => x.id === item.targetId)?.name ?? missing, valueLabel: SUPPLY_LABEL_TH[item.value as SupplyStatus] ?? item.value };
  if (item.kind === 'water_level') {
    const mark = s.marks.find((x) => x.id === item.targetId);
    return { target: mark?.name ?? missing, valueLabel: mark?.levels.find((l) => String(l.level) === item.value)?.label ?? `ระดับ ${item.value}` };
  }
  return { target: GENERAL_TARGETS[item.targetId] ?? 'ทั่วไป', valueLabel: item.note ?? '' };
}
