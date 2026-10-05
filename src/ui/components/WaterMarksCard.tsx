import type { Resolved } from '../../core/types';
import type { MarkRow } from '../../data/types';
import { AgeLabel } from './AgeLabel';

/** Resident-reported level at each wall mark. Expired/unknown => 'ไม่ทราบ'. Text only, no colour reliance. */
export function WaterMarksCard({ marks, states, now }: { marks: MarkRow[]; states: Record<string, Resolved<string>>; now: number }) {
  return (
    <section className="card marks" aria-labelledby="marks-h">
      <h2 id="marks-h">ระดับน้ำที่จุดวัด</h2>
      {marks.length === 0 && <p className="age">ยังไม่มีจุดวัดระดับน้ำในระบบ</p>}
      <ul className="marks__list">
        {marks.map((m) => {
          const st = states[m.id];
          const known = !!st && st.value !== 'unknown';
          const label = known ? (m.levels.find((l) => String(l.level) === st.value)?.label ?? `ขีดที่ ${st.value}`) : 'ไม่ทราบ';
          return (
            <li key={m.id}>
              <b>{m.name}</b>: <span>{label}</span>{' '}
              <AgeLabel at={known ? st.asOf : null} now={now} />
              {known && st.conflict && <> <small className="conflict">มีรายงานขัดแย้ง — แสดงระดับที่สูงกว่า</small></>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
