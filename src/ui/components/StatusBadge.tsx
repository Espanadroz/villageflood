import { STATUS_COLOR, STATUS_LABEL_TH } from '../../core/labels';
import type { SegmentState } from '../../core/types';

export function StatusBadge({ state, conflict }: { state: SegmentState; conflict?: boolean }) {
  return (
    <span className="badge-wrap">
      <span className={`badge badge--${state}`} style={{ background: STATUS_COLOR[state] }}>{STATUS_LABEL_TH[state]}</span>
      {conflict && <small className="conflict">มีรายงานขัดแย้ง</small>}
    </span>
  );
}
