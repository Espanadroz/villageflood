import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildGoogleMapsSearchUrl } from '../../core/routes';
import { SUPPLY_LABEL_TH } from '../../core/labels';
import type { PlaceCategory } from '../../data/types';
import { CATEGORY_LABEL_TH, placeLatLng, supplyViews } from '../../state/supplyViews';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from '../components/AgeLabel';

const COLOR = { open: '#1a9850', out_of_stock: '#f2a900', closed: '#d73027', unreachable: '#d73027', unknown: '#8a8f98' } as const;

export function SupplyPage() {
  const { snapshot: s, now } = useData();
  const snap = s!;
  const [cat, setCat] = useState<PlaceCategory | null>(null);
  const views = useMemo(() => supplyViews(snap, now, cat), [snap, now, cat]);
  return (
    <div className="page">
      <h1>จุดซื้อเสบียง</h1>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        <button type="button" className={cat === null ? '' : 'secondary'} aria-pressed={cat === null} onClick={() => setCat(null)}>ทั้งหมด</button>
        {(Object.keys(CATEGORY_LABEL_TH) as PlaceCategory[]).map((c) => <button key={c} type="button" className={cat === c ? '' : 'secondary'} aria-pressed={cat === c} onClick={() => setCat(c)}>{CATEGORY_LABEL_TH[c]}</button>)}
      </div>
      {views.length === 0 && <p>ยังไม่มีจุดในหมวดนี้</p>}
      {views.map(({ place, status, distanceM }) => {
        const ll = placeLatLng(place);
        return (
          <article key={place.id} className="card">
            <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{place.name}</strong>{Number.isFinite(distanceM) && <span>{(distanceM / 1000).toFixed(1)} กม.</span>}
            </header>
            <p style={{ margin: '4px 0' }}>
              <span className={`badge badge--supply-${status.value}`} style={{ background: COLOR[status.value], ...(status.value === 'out_of_stock' ? { color: '#222', textShadow: 'none' } : {}) }}>{SUPPLY_LABEL_TH[status.value]}</span> <AgeLabel at={status.asOf} now={now} />
            </p>
            {status.value === 'unknown' && <p className="age">ยังไม่มีรายงานล่าสุด — โทรหรือสอบถามก่อนเดินทาง</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="btn" to={`/report?kind=supply&target=${encodeURIComponent(place.id)}`}>รายงานสถานะ</Link>
              {ll && (
                <a className="btn secondary" style={{ background: '#fff', color: 'var(--brand)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  href={buildGoogleMapsSearchUrl(ll)} target="_blank" rel="noreferrer noopener">เปิดแผนที่</a>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
