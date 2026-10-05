import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LONGDO_CREDIT_TH } from '../../core/config';
import { derive } from '../../state/derive';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from '../components/AgeLabel';
import { FeedItemCard } from '../components/FeedItemCard';
import { Legend } from '../components/Legend';
import { StatusBadge } from '../components/StatusBadge';
import { IconAlert, IconPin, IconPlus, IconRoad, IconStore } from '../components/icons';
import { MapView } from '../map/MapView';

const EMPTY: never[] = [];

export function MapPage() {
  const { snapshot: s, now } = useData();
  const snap = s!;
  const [selected, setSelected] = useState<string | null>(null);
  const [showPlaces, setShowPlaces] = useState(false);
  const [showIncidents, setShowIncidents] = useState(false);
  const d = useMemo(() => derive(snap, now), [snap, now]);
  const [mapFailed, setMapFailed] = useState(false);
  const onMapError = useCallback(() => setMapFailed(true), []);
  const onMapHealthy = useCallback(() => setMapFailed(false), []);
  const highlightIds = useMemo(() => (selected ? [selected] : EMPTY), [selected]);
  const visiblePlaces = useMemo(() => (showPlaces ? snap.places : EMPTY), [showPlaces, snap.places]);
  const visibleIncidents = useMemo(() => (showIncidents ? snap.incidents.filter((i) => i.stopAt > now) : EMPTY), [showIncidents, snap.incidents, now]);
  const seg = snap.segments.find((x) => x.id === selected);
  const st = selected ? d.segmentStates[selected] : undefined;
  const items = snap.feed.filter((f) => f.kind === 'road' && f.targetId === selected).slice(0, 5);

  return (
    <div className="page page--wide mapgrid">
      <div className="mapgrid__map">
      <MapView segments={snap.segments} states={d.segmentStates} highlightIds={highlightIds}
        places={visiblePlaces} incidents={visibleIncidents}
        center={snap.settings.origin} onSelectSegment={setSelected} onError={onMapError} onHealthy={onMapHealthy} />
      {mapFailed && <p role="alert" className="conflict">แผนที่โหลดไม่สำเร็จ — ดูสถานะถนนจากรายการด้านล่าง</p>}
      <Legend />
      <div className="chiprow">
        <label className="toggle"><input type="checkbox" checked={showPlaces} onChange={(e) => setShowPlaces(e.target.checked)} /><IconStore /> จุดเสบียง</label>
        <label className="toggle"><input type="checkbox" checked={showIncidents} onChange={(e) => setShowIncidents(e.target.checked)} /><IconAlert /> เหตุน้ำท่วมจาก Longdo</label>
      </div>
      {showIncidents && <p className="age">{LONGDO_CREDIT_TH}</p>}
      </div>
      <div className="mapgrid__list">
      <section aria-label="รายการช่วงถนน">
        <h2 className="sect-h"><IconRoad />รายการช่วงถนน</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {snap.segments.map((x) => {
            const sx = d.segmentStates[x.id];
            return (
              <li key={x.id}>
                <button type="button" className="secondary" aria-pressed={selected === x.id} onClick={() => setSelected(x.id)}
                  style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
                  <strong>{x.name}</strong>
                  <span><StatusBadge state={sx?.value ?? 'unknown'} conflict={sx?.conflict} /> <AgeLabel at={sx?.asOf ?? null} now={now} /></span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {seg && st && (
        <section className="card">
          <h2 className="sect-h"><IconPin />{seg.name}</h2>
          <StatusBadge state={st.value} conflict={st.conflict} /> <AgeLabel at={st.asOf} now={now} />
          {st.value === 'unknown' && <p className="age">ยังไม่มีรายงานล่าสุดที่ยืนยันได้ — ห้ามถือว่าผ่านได้</p>}
          <p><Link className="btn" to={`/report?kind=road&target=${seg.id}`}><IconPlus />รายงานช่วงนี้</Link></p>
          {items.map((i) => <FeedItemCard key={i.id} item={i} snapshot={snap} now={now} />)}
        </section>
      )}
      </div>
    </div>
  );
}
