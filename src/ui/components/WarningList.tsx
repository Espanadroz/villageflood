import type { WarningRow } from '../../data/types';
import { safeHttpUrl } from '../../lib/url';
import { AgeLabel } from './AgeLabel';

export function WarningList({ warnings, now }: { warnings: WarningRow[]; now: number }) {
  if (!warnings.length) return null;
  return (
    <section>
      <h2 className="sect-h">ประกาศจากกรมอุตุนิยมวิทยา</h2>
      {warnings.slice(0, 3).map((w) => (
        <details key={w.id} className="card" open={w.mentionsBangkok}>
          <summary><strong>{w.title}</strong> {w.mentionsBangkok && <span className="badge" style={{ background: '#b3261e' }}>กล่าวถึงกรุงเทพฯ</span>} <AgeLabel at={w.issuedAt} now={now} /></summary>
          <p className="prewrap">{w.body}</p>
          {safeHttpUrl(w.url) && <a href={safeHttpUrl(w.url)!} target="_blank" rel="noreferrer noopener">ที่มา: กรมอุตุนิยมวิทยา</a>}
        </details>
      ))}
      {warnings.length > 3 && <p className="age">+{warnings.length - 3} รายการเก่ากว่า</p>}
    </section>
  );
}
