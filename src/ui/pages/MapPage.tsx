import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LONGDO_CREDIT_TH } from '../../core/config';
import { derive } from '../../state/derive';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from '../components/AgeLabel';
import { FeedItemCard } from '../components/FeedItemCard';
import { Legend } from '../components/Legend';
import { StatusBadge } from '../components/StatusBadge';
import { MapView } from '../map/MapView';

export function MapPage() {
  const { snapshot: s, now } = useData();
  const snap = s!;
  const [selected, setSelected] = useState<string | null>(null);
  const [showPlaces, setShowPlaces] = useState(false);
  const [showIncidents, setShowIncidents] = useState(false);
  const d = useMemo(() => derive(snap, now), [snap, now]);
  const seg = snap.segments.find((x) => x.id === selected);
  const st = selected ? d.segmentStates[selected] : undefined;
  const items = snap.feed.filter((f) => f.kind === 'road' && f.targetId === selected).slice(0, 5);

  return (
    <div className="page">
      <MapView segments={snap.segments} states={d.segmentStates} highlightIds={selected ? [selected] : []}
        places={showPlaces ? snap.places : []} incidents={showIncidents ? snap.incidents.filter((i) => i.stopAt > now) : []}
        center={snap.settings.origin} onSelectSegment={setSelected} />
      <Legend />
      <label><input type="checkbox" checked={showPlaces} onChange={(e) => setShowPlaces(e.target.checked)} /> จุดเสบียง</label>{' '}
      <label><input type="checkbox" checked={showIncidents} onChange={(e) => setShowIncidents(e.target.checked)} /> เหตุน้ำท่วมจาก Longdo</label>
      {showIncidents && <p className="age">{LONGDO_CREDIT_TH}</p>}
      {seg && st && (
        <section className="card">
          <h2 style={{ margin: 0 }}>{seg.name}</h2>
          <StatusBadge state={st.value} conflict={st.conflict} /> <AgeLabel at={st.asOf} now={now} />
          {st.value === 'unknown' && <p className="age">ยังไม่มีรายงานล่าสุดที่ยืนยันได้ — ห้ามถือว่าผ่านได้</p>}
          <p><Link className="btn" to={`/report?kind=road&target=${seg.id}`}>รายงานช่วงนี้</Link></p>
          {items.map((i) => <FeedItemCard key={i.id} item={i} snapshot={snap} now={now} />)}
        </section>
      )}
    </div>
  );
}
