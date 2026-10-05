import type { ReactNode } from 'react';
import { STATUS_COLOR, STATUS_LABEL_TH } from '../../core/labels';
import type { SegmentState } from '../../core/types';
import { IconBan, IconCar, IconCheck, IconHelp, IconTruck } from './icons';

/** A shape per state so the status is readable without colour. */
const ICON: Record<SegmentState, ReactNode> = { dry: <IconCheck />, small_car: <IconCar />, high_clearance: <IconTruck />, impassable: <IconBan />, unknown: <IconHelp /> };

export function StatusBadge({ state, conflict }: { state: SegmentState; conflict?: boolean }) {
  return (
    <span className="badge-wrap">
      <span className={`badge badge--${state}`} style={{ background: STATUS_COLOR[state] }}><span className="badge__ico">{ICON[state]}</span>{STATUS_LABEL_TH[state]}</span>
      {conflict && <small className="conflict">มีรายงานขัดแย้ง</small>}
    </span>
  );
}
