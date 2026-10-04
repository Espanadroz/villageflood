import { STATUS_COLOR, STATUS_LABEL_TH } from '../../core/labels';
import type { SegmentState } from '../../core/types';

const ORDER: SegmentState[] = ['dry', 'small_car', 'high_clearance', 'impassable', 'unknown'];
export const Legend = () => (
  <ul className="legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', listStyle: 'none', padding: 0, margin: '8px 0', fontSize: 13 }}>
    {ORDER.map((s) => (
      <li key={s}><span style={{ display: 'inline-block', width: 22, height: 0, borderTop: `5px ${s === 'unknown' ? 'dashed' : 'solid'} ${STATUS_COLOR[s]}`, verticalAlign: 'middle', marginRight: 4 }} />{STATUS_LABEL_TH[s]}</li>
    ))}
  </ul>
);
