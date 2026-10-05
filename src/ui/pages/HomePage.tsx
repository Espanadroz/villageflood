import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_COLOR, STATUS_LABEL_TH } from '../../core/labels';
import type { SegmentState } from '../../core/types';
import { agencyView, committeeNote, visibleWarnings } from '../../state/agencyView';
import { derive } from '../../state/derive';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from '../components/AgeLabel';
import { FeedItemCard } from '../components/FeedItemCard';
import { GaugeCard } from '../components/GaugeCard';
import { RainCard } from '../components/RainCard';
import { WarningList } from '../components/WarningList';
import { WaterMarksCard } from '../components/WaterMarksCard';
import { IconCamera, IconDroplet, IconMessage, IconRoad, IconShield } from '../components/icons';

export function HomePage() {
  const { snapshot: s, now } = useData();
  const snap = s!;
  const a = useMemo(() => agencyView(snap, now), [snap, now]);
  const d = useMemo(() => derive(snap, now), [snap, now]);
  const counts = useMemo(() => {
    const c: Record<SegmentState, number> = { dry: 0, small_car: 0, high_clearance: 0, impassable: 0, unknown: 0 };
    Object.values(d.segmentStates).forEach((r) => { c[r.value]++; });
    return c;
  }, [d]);
  const present = (Object.keys(counts) as SegmentState[]).filter((k) => counts[k]);
  const total = present.reduce((n, k) => n + counts[k], 0);
  const wall = committeeNote(snap, 'wall', now);
  const drainage = committeeNote(snap, 'drainage', now);
  const maxAge = snap.settings.agencyMaxAgeMs;

  return (
    <div className="page page--wide">
      <h1>พอร์ทัลน้ำท่วมหมู่บ้าน</h1>
      <div className="split">
      <div className="split__main">
      <section className="notice">
        <div className="notice__h"><IconShield /><strong>กรรมการหมู่บ้านแจ้ง</strong></div>
        {([['กำแพงริมคลอง', wall], ['การระบายน้ำ', drainage]] as const).map(([label, n]) => (
          <p key={label}>
            <b>{label}:</b> {n && n.note.trim() ? n.note : 'ยังไม่มีการอัปเดตจากกรรมการ'}{' '}
            {n && n.note.trim() && <AgeLabel at={n.createdAt} now={now} maxAgeMs={n.stale ? 0 : undefined} />}
          </p>
        ))}
      </section>

      <h2 className="sect-h"><IconDroplet />ระดับน้ำคลอง</h2>
      {a.primary ? <GaugeCard g={a.primary} now={now} maxAgeMs={maxAge} big />
        : <section className="card"><strong>คลองสองต้นนุ่น ซ.ร่มเกล้า 20</strong><p className="age">ไม่มีข้อมูลล่าสุดจากหน่วยงาน</p></section>}
      {a.others.length > 0 && <div className="group" style={{ margin: '10px 0' }}>{a.others.map((g) => <GaugeCard key={g.stationId} g={g} now={now} maxAgeMs={maxAge} />)}</div>}
      <RainCard rain={a.rain} now={now} maxAgeMs={maxAge} />
      <WarningList warnings={visibleWarnings(snap, now)} now={now} />
      <WaterMarksCard marks={snap.marks} states={d.markStates} now={now} />
      </div>
      <div className="split__side">
      <h2 className="sect-h"><IconRoad />สรุปถนน <Link to="/map" className="sect-h__link">ดูแผนที่</Link></h2>
      <section className="card">
        {total > 0 && (
          <div className="bar" aria-hidden="true">
            {present.map((k) => <span key={k} style={{ flex: counts[k], background: STATUS_COLOR[k] }} />)}
          </div>
        )}
        <p style={{ marginTop: total > 0 ? 10 : 0 }}>{present.map((k) => `${STATUS_LABEL_TH[k]} ${counts[k]}`).join(' · ') || 'ยังไม่มีช่วงถนนในระบบ'}</p>
      </section>

      <h2 className="sect-h"><IconMessage />รายงานล่าสุด</h2>
      {snap.feed.length === 0 && (
        <div className="empty">
          <span className="empty__ico"><IconCamera /></span>
          <p>ยังไม่มีรายงานใน 7 วันที่ผ่านมา</p>
          <Link className="btn" to="/report"><IconCamera />เป็นคนแรกที่รายงาน</Link>
        </div>
      )}
      {snap.feed.slice(0, 20).map((f) => <FeedItemCard key={f.id} item={f} snapshot={snap} now={now} />)}
      </div>
      </div>
    </div>
  );
}
