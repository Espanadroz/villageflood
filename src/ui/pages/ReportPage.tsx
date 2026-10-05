import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requiresEvidence } from '../../core/evidence';
import { STATUS_LABEL_TH, SUPPLY_LABEL_TH } from '../../core/labels';
import type { ReportKind } from '../../core/types';
import { validateDraft } from '../../core/validate';
import { getDeviceId, getNickname, getUploadKey, setNickname } from '../../data/device';
import { describeSubmitError, type OutboxItem } from '../../data/submit';
import { getPositionNow, useGeolocation } from '../../lib/useGeolocation';
import { newId } from '../../lib/uuid';
import { outbox } from '../../state/outbox';
import { useOutboxStatus } from '../../state/OutboxContext';
import { useData } from '../../state/SnapshotContext';
import { ConsentGate } from '../components/ConsentGate';
import { EvidenceCapture, type Captured } from '../components/EvidenceCapture';
import { IconBan, IconBasket, IconCar, IconCheck, IconDroplet, IconMessage, IconPin, IconRoad, IconSend, IconTruck } from '../components/icons';

const KINDS: [ReportKind, string][] = [['road', 'สภาพถนน'], ['water_level', 'ระดับน้ำ'], ['supply', 'จุดเสบียง'], ['general', 'ข้อความทั่วไป']];
const KIND_ICON: Record<ReportKind, ReactNode> = { road: <IconRoad />, water_level: <IconDroplet />, supply: <IconBasket />, general: <IconMessage /> };
const ROAD_ICON: Record<string, ReactNode> = { dry: <IconCheck />, small_car: <IconCar />, high_clearance: <IconTruck />, impassable: <IconBan /> };
const ROAD_VALUES = ['dry', 'small_car', 'high_clearance', 'impassable'] as const;
const SAVED_MSG = 'ยังส่งไม่สำเร็จ — เก็บรายงานไว้ในเครื่องแล้ว จะส่งให้อัตโนมัติเมื่อเชื่อมต่อได้';
const SUPPLY_VALUES = ['open', 'closed', 'out_of_stock', 'unreachable'] as const;
const LOCATION_WAIT_MS = 8000;
const LOCATION_HOLD_MS = 8000;

export function ReportPage() {
  return (
    <div className="page page--form">
      <h1>ส่งรายงาน</h1>
      <ConsentGate><ReportForm /></ConsentGate>
    </div>
  );
}

function ReportForm() {
  const { snapshot } = useData();
  const [params] = useSearchParams();
  const initialKind = (params.get('kind') as ReportKind) || 'road';
  const [kind, setKind] = useState<ReportKind>(KINDS.some(([k]) => k === initialKind) ? initialKind : 'road');
  const [rawTarget, setTargetId] = useState(params.get('target') ?? '');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [nickname, setNick] = useState(getNickname());
  const [evidence, setEvidence] = useState<Captured | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { pos, error: geoError, refresh } = useGeolocation();
  const { refresh: refreshOutbox } = useOutboxStatus();
  const s = snapshot!;

  const targets: { id: string; name: string }[] =
    kind === 'road' ? s.segments : kind === 'water_level' ? s.marks : kind === 'supply' ? s.places
    : [{ id: 'village', name: 'ทั่วไป' }];
  const targetId = targets.some((t) => t.id === rawTarget) ? rawTarget : '';
  const generalTarget = kind === 'general' ? 'village' : targetId;
  const values: { v: string; label: string }[] =
    kind === 'road' ? ROAD_VALUES.map((v) => ({ v, label: STATUS_LABEL_TH[v] }))
    : kind === 'supply' ? SUPPLY_VALUES.map((v) => ({ v, label: SUPPLY_LABEL_TH[v] }))
    : kind === 'water_level' ? (s.marks.find((m) => m.id === targetId)?.levels ?? []).map((l) => ({ v: String(l.level), label: l.label }))
    : [{ v: 'note', label: 'ข้อความ' }];
  const effectiveValue = kind === 'general' ? 'note' : value;
  const evidenceRequired = !!effectiveValue && requiresEvidence(kind, effectiveValue);

  async function submit() {
    const errs = validateDraft({ kind, targetId: generalTarget, value: effectiveValue, nickname, hasEvidence: !!evidence, note });
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      setNickname(nickname);
      // Persist FIRST (held while we wait for a location fix), so closing the tab during the wait loses nothing:
      // after the hold expires the item is sent without coordinates and waits for committee confirmation.
      const draft = { deviceId: getDeviceId(), nickname: nickname.trim(), kind, targetId: generalTarget, value: effectiveValue, lat: null, lng: null, note: kind === 'general' ? note.trim() : null };
      const item: OutboxItem = {
        id: newId(), createdAt: Date.now(), attempts: 0, blob: evidence?.blob ?? null, mediaType: evidence?.mediaType ?? null,
        uploadKey: getUploadKey(), holdUntil: Date.now() + LOCATION_HOLD_MS, draft,
      };
      try { await outbox.add(item); }
      catch { setErrors(['บันทึกไม่สำเร็จ — รายงานยังไม่ถูกเก็บ กรุณาลองอีกครั้ง']); return; }
      const where = (await getPositionNow(LOCATION_WAIT_MS)) ?? pos;
      try { await outbox.update(item.id, { draft: { ...draft, lat: where?.lat ?? null, lng: where?.lng ?? null }, holdUntil: 0 }); }
      catch { /* still saved; the hold expires and it is sent without coordinates */ }
      try { await outbox.flush(); }
      catch { setDone(SAVED_MSG); return; }
      const [pending, failed] = await Promise.all([outbox.pending(), outbox.failed()]);
      const bad = failed.find((f) => f.item.id === item.id);
      if (pending.some((p) => p.id === item.id)) setDone(SAVED_MSG);
      else if (bad) setErrors([describeSubmitError(bad.reason), 'รายงานนี้ยังไม่ได้ถูกส่ง']);
      else setDone('ส่งรายงานแล้ว ขอบคุณครับ/ค่ะ');
    } catch {
      setErrors(['เกิดข้อผิดพลาด กรุณาตรวจสอบว่ารายงานถูกเก็บไว้แล้วหรือไม่ ก่อนลองอีกครั้ง']);
    } finally {
      setBusy(false);
      void refreshOutbox();
    }
  }

  if (done) return <div className="card done"><span className="done__ico"><IconCheck /></span><p>{done}</p><button onClick={() => { setDone(null); setValue(''); setEvidence(null); setNote(''); }}>รายงานเพิ่ม</button></div>;

  return (
    <>
        <div className="card">
          <strong>ประเภท</strong>
          <div className="chiprow">
            {KINDS.map(([k, label]) => (
              <button key={k} type="button" className={k === kind ? '' : 'secondary'} onClick={() => { setKind(k); setTargetId(''); setValue(''); setEvidence(null); }}>{KIND_ICON[k]}{label}</button>
            ))}
          </div>
        </div>
        {kind !== 'general' && (
          <div className="card">
            <label className="field"><span className="with-ico"><IconPin />จุดที่รายงาน</span>
              <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setValue(''); }} style={{ width: '100%', minHeight: 44 }}>
                <option value="">— เลือก —</option>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <fieldset className="card"><legend>สถานะ</legend>
          {kind === 'general'
            ? <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} style={{ width: '100%' }} placeholder="พิมพ์ข้อความ" />
            : values.map((o) => (
              <label key={o.v} className="opt">
                <input type="radio" name="value" checked={value === o.v} onChange={() => setValue(o.v)} />{kind === 'road' && <span className="opt__ico">{ROAD_ICON[o.v]}</span>}{o.label}
              </label>))}
        </fieldset>
        {kind !== 'general' && <EvidenceCapture key={kind} required={evidenceRequired} onChange={setEvidence} />}
        <div className="card">
          <label className="field"><span>ชื่อเล่น</span><input value={nickname} onChange={(e) => setNick(e.target.value)} maxLength={40} style={{ width: '100%', minHeight: 44 }} /></label>
          <p className="age">
            {pos ? `ได้ตำแหน่งแล้ว (±${Math.round(pos.accuracy)} ม.)`
              : geoError ? 'ไม่ได้ตำแหน่ง — รายงานจะรอกรรมการยืนยันก่อนมีผลต่อสถานะ ' : 'กำลังหาตำแหน่ง… '}
            {!pos && <button type="button" className="secondary" onClick={refresh}>ลองอีกครั้ง</button>}
          </p>
        </div>
        {errors.length > 0 && <ul role="alert" className="conflict errlist">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <button type="button" className="cta" disabled={busy} onClick={submit}><IconSend />ส่งรายงาน</button>
    </>
  );
}
