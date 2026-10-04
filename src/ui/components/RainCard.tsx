import type { RainView } from '../../state/agencyView';
import { AgeLabel } from './AgeLabel';

export function RainCard({ rain, now, maxAgeMs }: { rain: RainView[]; now: number; maxAgeMs: number }) {
  if (!rain.length) return <section className="card"><strong>ฝน</strong><p className="age">ไม่มีข้อมูลล่าสุดจากสถานีใกล้เคียง</p></section>;
  return (
    <section className="card">
      <strong>ฝนสถานีใกล้เคียง (มม.)</strong>
      <table style={{ width: '100%', fontSize: 14, marginTop: 6 }}>
        <thead><tr><th align="left">สถานี</th><th>1 ชม.</th><th>24 ชม.</th><th align="left">เวลา</th></tr></thead>
        <tbody>{rain.map((r) => (
          <tr key={r.stationId}><td>{r.name}</td><td align="center">{r.rf1hr ?? '–'}</td><td align="center">{r.rf24hr ?? '–'}</td><td><AgeLabel at={r.observedAt} now={now} maxAgeMs={maxAgeMs} /></td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}
