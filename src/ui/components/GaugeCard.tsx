import { TREND_LABEL_TH } from '../../core/labels';
import type { GaugeView } from '../../state/agencyView';
import { AgeLabel } from './AgeLabel';
import { GaugeRuler } from './GaugeRuler';
import { sourceLabelTh } from './sources';

const STATE_LABEL: Record<GaugeView['state'], string> = { uncalibrated: '', stale: 'ข้อมูลเก่า', normal: 'ปกติ', watch: 'เฝ้าระวัง', danger: 'อันตราย' };
const STATE_COLOR: Record<GaugeView['state'], string> = { uncalibrated: 'transparent', stale: '#8a8f98', normal: '#1a9850', watch: '#f2a900', danger: '#d73027' };

export function GaugeCard({ g, now, maxAgeMs, big }: { g: GaugeView; now: number; maxAgeMs: number; big?: boolean }) {
  const showState = g.state !== 'uncalibrated' && g.state !== 'stale';
  const body = (
    <>
      <div className="gauge__title">{g.name}</div>
      <div><AgeLabel at={g.observedAt} now={now} maxAgeMs={maxAgeMs} /> <span className="source">ที่มา: {sourceLabelTh(g.source)}</span></div>
      {g.stale && <p className="age" style={{ margin: '8px 0 0' }}>ค่าล่าสุดที่ได้:</p>}
      <div className="gauge__val">
        <span className="gauge__num">{Number.isFinite(g.value) ? g.value.toFixed(2) : '–'}</span>
        <span className="gauge__unit">{g.unit}</span>
        {showState && <span className={`badge badge--${g.state}`} style={{ background: STATE_COLOR[g.state] }}>{STATE_LABEL[g.state]}</span>}
      </div>
      <p className="gauge__meta">{g.stale ? 'ไม่ใช้เป็นข้อมูลปัจจุบัน' : `แนวโน้ม: ${TREND_LABEL_TH[g.trend]}`}</p>
      {g.state === 'uncalibrated' && <p className="gauge__note">ค่าดิบจากหน่วยงาน ยังไม่ได้ตั้งเกณฑ์เตือนของหมู่บ้าน</p>}
    </>
  );
  if (big) {
    return (
      <section className={`card gauge${g.stale ? ' gauge--stale' : ''}`}>
        <GaugeRuler value={g.value} />
        <div>{body}</div>
      </section>
    );
  }
  return (
    <section className={`row${g.stale ? ' row--stale' : ''}`}>
      <div className="row__top"><span className="row__title">{g.name}</span><span className="row__val">{Number.isFinite(g.value) ? g.value.toFixed(2) : '–'} <small className="gauge__unit">{g.unit}</small></span></div>
      <div><AgeLabel at={g.observedAt} now={now} maxAgeMs={maxAgeMs} /> <span className="source">ที่มา: {sourceLabelTh(g.source)}</span></div>
      {g.stale && <p className="age">ค่าล่าสุดที่ได้ · ไม่ใช้เป็นข้อมูลปัจจุบัน</p>}
      {!g.stale && <p className="age">แนวโน้ม: {TREND_LABEL_TH[g.trend]}{g.state === 'uncalibrated' && ' · ค่าดิบจากหน่วยงาน ยังไม่ได้ตั้งเกณฑ์เตือนของหมู่บ้าน'}</p>}
      {showState && <span className={`badge badge--${g.state}`} style={{ background: STATE_COLOR[g.state] }}>{STATE_LABEL[g.state]}</span>}
    </section>
  );
}
