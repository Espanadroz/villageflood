import { freshness } from '../../core/agency';
import { formatAgeTh } from '../../core/format';

export function AgeLabel({ at, now, maxAgeMs }: { at: number | null; now: number; maxAgeMs?: number }) {
  if (at === null) return <span className="age age--none">ไม่มีข้อมูล</span>;
  const { ageMs, stale } = freshness(at, now, maxAgeMs ?? Number.POSITIVE_INFINITY);
  return (
    <span className={`age${stale ? ' age--stale' : ''}`}>
      {stale ? 'ข้อมูลเก่า · ' : ''}อัปเดต {formatAgeTh(ageMs)}
    </span>
  );
}
