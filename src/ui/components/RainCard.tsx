import type { RainCell, RainView } from '../../state/agencyView';
import { AgeLabel } from './AgeLabel';
import { sourceLabelTh } from './sources';

const UNIT_FALLBACK = 'หน่วยตามที่หน่วยงานรายงาน';

function Cell({ c, now, maxAgeMs }: { c: RainCell | null; now: number; maxAgeMs: number }) {
  if (!c) return <td>–</td>;
  return (
    <td className={c.stale ? 'raintable__stale' : undefined}>
      {Number.isFinite(c.value) ? c.value : '–'}
      <div><AgeLabel at={c.observedAt} now={now} maxAgeMs={maxAgeMs} /></div>
      {c.stale && <div className="age">ไม่ใช้เป็นข้อมูลปัจจุบัน</div>}
    </td>
  );
}

export function RainCard({ rain, now, maxAgeMs }: { rain: RainView[]; now: number; maxAgeMs: number }) {
  if (!rain.length) return <section className="card"><strong>ฝน</strong><p className="age">ไม่มีข้อมูลล่าสุดจากสถานีใกล้เคียง</p></section>;
  const units = new Set(rain.map((r) => r.unit));
  const unit = units.size === 1 ? [...units][0] : null;
  return (
    <section className="card">
      <strong>ฝนสถานีใกล้เคียง ({unit ?? UNIT_FALLBACK})</strong> <span className="source">ที่มา: {sourceLabelTh('bma_rain')}</span>
      <table className="raintable">
        <thead><tr><th>สถานี</th><th>1 ชม.</th><th>24 ชม.</th></tr></thead>
        <tbody>{rain.map((r) => (
          <tr key={r.stationId}><td>{r.name}</td><Cell c={r.rf1hr} now={now} maxAgeMs={maxAgeMs} /><Cell c={r.rf24hr} now={now} maxAgeMs={maxAgeMs} /></tr>
        ))}</tbody>
      </table>
    </section>
  );
}
