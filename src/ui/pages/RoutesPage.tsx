import { useCallback, useMemo, useState } from 'react';
import { buildGoogleMapsUrl } from '../../core/routes';
import { VEHICLE_LABEL_TH } from '../../core/labels';
import type { VehicleClass } from '../../core/types';
import { derive } from '../../state/derive';
import { recommended, routeViews, type RouteView } from '../../state/routeViews';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from '../components/AgeLabel';
import { Legend } from '../components/Legend';
import { MapView } from '../map/MapView';

const VEHICLE_KEY = 'flood.vehicle';
const loadVehicle = (): VehicleClass => { try { return localStorage.getItem(VEHICLE_KEY) === 'high_clearance' ? 'high_clearance' : 'small_car'; } catch { return 'small_car'; } };

const STATE_TEXT = { ok: 'ไปได้ (ตามรายงานล่าสุด)', unknown: 'ไม่ทราบ — ยังไม่มีข้อมูลบางช่วง', blocked: 'ไปไม่ได้' } as const;
const STATE_COLOR = { ok: '#1a9850', unknown: '#8a8f98', blocked: '#d73027' } as const;
const EMPTY: never[] = [];

const finiteLL = (p: { lat: number; lng: number } | undefined): p is { lat: number; lng: number } =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export function RoutesPage() {
  const { snapshot: s, now } = useData();
  const snap = s!;
  const [vehicle, setVehicle] = useState<VehicleClass>(loadVehicle);
  const [dest, setDest] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const onMapError = useCallback(() => setMapFailed(true), []);
  const onMapHealthy = useCallback(() => setMapFailed(false), []);
  const views = useMemo(() => routeViews(snap, now, vehicle, dest), [snap, now, vehicle, dest]);
  const best = recommended(views);
  const d = useMemo(() => derive(snap, now), [snap, now]);
  const openView = useMemo(() => views.find((v) => v.route.id === open) ?? null, [views, open]);
  const highlightIds = useMemo(() => openView?.route.segmentIds ?? EMPTY, [openView]);
  const chooseVehicle = (v: VehicleClass) => { setVehicle(v); try { localStorage.setItem(VEHICLE_KEY, v); } catch { /* ignore */ } };

  const mapsUrl = (v: RouteView): string | null => {
    const dd = v.destination;
    if (!dd || !finiteLL({ lat: dd.lat, lng: dd.lng }) || !finiteLL(snap.settings.origin)) return null;
    const wps = v.route.waypoints.filter(finiteLL);
    return buildGoogleMapsUrl({ origin: snap.settings.origin, destination: { lat: dd.lat, lng: dd.lng }, waypoints: wps });
  };

  const card = (v: RouteView) => {
    const url = open === v.route.id ? mapsUrl(v) : null;
    return (
      <article key={v.route.id} className="card" style={{ borderLeft: `6px solid ${STATE_COLOR[v.status.state]}` }}>
        <header style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong>{v.route.name}{best?.route.id === v.route.id ? ' ★ แนะนำ' : ''}</strong>
          <span>{(v.route.distanceM / 1000).toFixed(1)} กม.</span>
        </header>
        <p style={{ margin: '4px 0', fontWeight: 700 }}>{v.destination?.name} · {STATE_TEXT[v.status.state]} สำหรับ{VEHICLE_LABEL_TH[vehicle]}{v.status.hasConflict && ' · มีรายงานขัดแย้ง'}</p>
        {v.blockedNames.length > 0 && <p className="conflict">ติดที่: {v.blockedNames.join(', ')}</p>}
        {v.unknownNames.length > 0 && <p className="age">ไม่มีข้อมูล: {v.unknownNames.join(', ')} (ห้ามถือว่าผ่านได้)</p>}
        <p className="age">ช่วงที่เก่าที่สุดในเส้นนี้: <AgeLabel at={v.status.oldestAsOf} now={now} /></p>
        <button type="button" className="secondary" onClick={() => setOpen(open === v.route.id ? null : v.route.id)}>{open === v.route.id ? 'ซ่อนแผนที่' : 'ดูบนแผนที่'}</button>
        {open === v.route.id && (
          <div style={{ marginTop: 8 }}>
            <MapView segments={snap.segments} states={d.segmentStates} highlightIds={highlightIds} center={snap.settings.origin} zoom={13} height="45dvh"
              onError={onMapError} onHealthy={onMapHealthy} />
            {mapFailed && <p role="alert" className="conflict">แผนที่โหลดไม่สำเร็จ — ดูสถานะเส้นทางจากรายการด้านบน</p>}
            <Legend />
            {url && (
              <>
                <p className="age">Google Maps อาจพาไปทางอื่นที่ไม่ใช่เส้นนี้ — ดูเส้นบนแผนที่ในแอปเป็นหลักเสมอ</p>
                <a className="btn" href={url} target="_blank" rel="noreferrer noopener">เปิดนำทางใน Google Maps</a>
              </>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="page">
      <h1>เส้นทางออกจากหมู่บ้าน</h1>
      <div role="group" aria-label="ประเภทรถ" style={{ display: 'flex', gap: 8 }}>
        {(['small_car', 'high_clearance'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={vehicle === v} className={vehicle === v ? '' : 'secondary'} onClick={() => chooseVehicle(v)}>{VEHICLE_LABEL_TH[v]}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
        <button type="button" aria-pressed={dest === null} className={dest === null ? '' : 'secondary'} onClick={() => setDest(null)}>ทั้งหมด</button>
        {snap.destinations.map((x) => <button key={x.id} type="button" aria-pressed={dest === x.id} className={dest === x.id ? '' : 'secondary'} onClick={() => setDest(x.id)}>{x.name}</button>)}
      </div>
      {!best && views.length > 0 && <div className="banner banner--warn">ขณะนี้ยังไม่มีเส้นทางที่ยืนยันได้ว่าไปได้สำหรับ{VEHICLE_LABEL_TH[vehicle]} — โปรดรายงานสภาพถนนช่วยกัน</div>}
      {views.length === 0 && <p>ยังไม่มีเส้นทางในระบบ</p>}
      {views.map(card)}
    </div>
  );
}
