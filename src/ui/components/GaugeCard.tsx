import { TREND_LABEL_TH } from '../../core/labels';
import type { GaugeView } from '../../state/agencyView';
import { AgeLabel } from './AgeLabel';

const STATE_LABEL: Record<GaugeView['state'], string> = { uncalibrated: '', stale: 'ข้อมูลเก่า', normal: 'ปกติ', watch: 'เฝ้าระวัง', danger: 'อันตราย' };
const STATE_COLOR: Record<GaugeView['state'], string> = { uncalibrated: 'transparent', stale: '#8a8f98', normal: '#1a9850', watch: '#f2a900', danger: '#d73027' };

export function GaugeCard({ g, now, maxAgeMs, big }: { g: GaugeView; now: number; maxAgeMs: number; big?: boolean }) {
  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{g.name}</strong><AgeLabel at={g.observedAt} now={now} maxAgeMs={maxAgeMs} />
      </div>
      <p style={{ margin: '4px 0', fontSize: big ? 32 : 22, fontWeight: 700 }}>
        {Number.isFinite(g.value) ? g.value.toFixed(2) : '–'} <small style={{ fontSize: 14, fontWeight: 400 }}>{g.unit}</small>
        {g.state !== 'uncalibrated' && <span className="badge" style={{ background: STATE_COLOR[g.state], marginLeft: 8 }}>{STATE_LABEL[g.state]}</span>}
      </p>
      <p className="age">{g.stale ? 'ไม่ใช้เป็นข้อมูลปัจจุบัน' : `แนวโน้ม: ${TREND_LABEL_TH[g.trend]}`}
        {g.state === 'uncalibrated' && ' · ค่าดิบจากหน่วยงาน ยังไม่ได้ตั้งเกณฑ์เตือนของหมู่บ้าน'}</p>
    </section>
  );
}
