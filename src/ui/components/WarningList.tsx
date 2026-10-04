import type { WarningRow } from '../../data/types';
import { AgeLabel } from './AgeLabel';

export function WarningList({ warnings, now }: { warnings: WarningRow[]; now: number }) {
  if (!warnings.length) return null;
  return (
    <section>
      <h2>ประกาศจากกรมอุตุนิยมวิทยา</h2>
      {warnings.slice(0, 3).map((w) => (
        <details key={w.id} className="card" open={w.mentionsBangkok}>
          <summary><strong>{w.title}</strong> {w.mentionsBangkok && <span className="badge" style={{ background: '#d73027' }}>กล่าวถึงกรุงเทพฯ</span>} <AgeLabel at={w.issuedAt} now={now} /></summary>
          <p style={{ whiteSpace: 'pre-line' }}>{w.body}</p>
          {w.url && <a href={w.url} target="_blank" rel="noreferrer">ที่มา: กรมอุตุนิยมวิทยา</a>}
        </details>
      ))}
    </section>
  );
}
