import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requiresEvidence } from '../../core/evidence';
import { STATUS_LABEL_TH, SUPPLY_LABEL_TH } from '../../core/labels';
import type { ReportKind } from '../../core/types';
import { validateDraft } from '../../core/validate';
import { getDeviceId, getNickname, setNickname } from '../../data/device';
import { describeSubmitError, type OutboxItem } from '../../data/submit';
import { useGeolocation } from '../../lib/useGeolocation';
import { outbox, useOutboxCount } from '../../state/outbox';
import { useData } from '../../state/SnapshotContext';
import { ConsentGate } from '../components/ConsentGate';
import { EvidenceCapture, type Captured } from '../components/EvidenceCapture';

const KINDS: [ReportKind, string][] = [['road', 'สภาพถนน'], ['water_level', 'ระดับน้ำ'], ['supply', 'จุดเสบียง'], ['general', 'ข้อความทั่วไป']];
const ROAD_VALUES = ['dry', 'small_car', 'high_clearance', 'impassable'] as const;
const SUPPLY_VALUES = ['open', 'closed', 'out_of_stock', 'unreachable'] as const;

export function ReportPage() {
  const { snapshot } = useData();
  const [params] = useSearchParams();
  const initialKind = (params.get('kind') as ReportKind) || 'road';
  const [kind, setKind] = useState<ReportKind>(KINDS.some(([k]) => k === initialKind) ? initialKind : 'road');
  const [targetId, setTargetId] = useState(params.get('target') ?? '');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [nickname, setNick] = useState(getNickname());
  const [evidence, setEvidence] = useState<Captured | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { pos, error: geoError, refresh } = useGeolocation();
  const pendingCount = useOutboxCount();
  const s = snapshot!;

  const targets: { id: string; name: string }[] =
    kind === 'road' ? s.segments : kind === 'water_level' ? s.marks : kind === 'supply' ? s.places
    : [{ id: 'village', name: 'ทั่วไป' }];
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
    setNickname(nickname);
    const item: OutboxItem = {
      id: crypto.randomUUID(), createdAt: Date.now(), attempts: 0, blob: evidence?.blob ?? null, mediaType: evidence?.mediaType ?? null,
      draft: { deviceId: getDeviceId(), nickname: nickname.trim(), kind, targetId: generalTarget, value: effectiveValue, lat: pos?.lat ?? null, lng: pos?.lng ?? null, note: kind === 'general' ? note.trim() : null },
    };
    await outbox.add(item);
    const r = await outbox.flush();
    setBusy(false);
    if (r.failed) { const f = (await outbox.failed()).at(-1); setErrors([describeSubmitError(f?.reason ?? '')]); }
    else if (r.stoppedOnRetry) setDone('ยังส่งไม่สำเร็จ — เก็บรายงานไว้ในเครื่องแล้ว จะส่งให้อัตโนมัติเมื่อเชื่อมต่อได้');
    else setDone('ส่งรายงานแล้ว ขอบคุณครับ/ค่ะ');
  }

  if (done) return <div className="page"><div className="card"><p>{done}</p><button onClick={() => { setDone(null); setValue(''); setEvidence(null); setNote(''); }}>รายงานเพิ่ม</button></div></div>;

  return (
    <div className="page">
      <h1>ส่งรายงาน</h1>
      {pendingCount > 0 && <div className="banner banner--warn">มี {pendingCount} รายงานรอส่ง จะส่งให้อัตโนมัติเมื่อมีอินเทอร์เน็ต</div>}
      <ConsentGate>
        <div className="card">
          <strong>ประเภท</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {KINDS.map(([k, label]) => (
              <button key={k} type="button" className={k === kind ? '' : 'secondary'} onClick={() => { setKind(k); setTargetId(''); setValue(''); setEvidence(null); }}>{label}</button>
            ))}
          </div>
        </div>
        {kind !== 'general' && (
          <div className="card">
            <label>จุดที่รายงาน
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
              <label key={o.v} style={{ display: 'block', padding: '8px 0' }}>
                <input type="radio" name="value" checked={value === o.v} onChange={() => setValue(o.v)} /> {o.label}
              </label>))}
        </fieldset>
        {kind !== 'general' && <EvidenceCapture required={evidenceRequired} onChange={setEvidence} />}
        <div className="card">
          <label>ชื่อเล่น <input value={nickname} onChange={(e) => setNick(e.target.value)} maxLength={40} style={{ width: '100%', minHeight: 44 }} /></label>
          <p className="age">
            {pos ? `ได้ตำแหน่งแล้ว (±${Math.round(pos.accuracy)} ม.)`
              : geoError ? 'ไม่ได้ตำแหน่ง — รายงานจะรอกรรมการยืนยันก่อนมีผลต่อสถานะ ' : 'กำลังหาตำแหน่ง… '}
            {!pos && <button type="button" className="secondary" onClick={refresh}>ลองอีกครั้ง</button>}
          </p>
        </div>
        {errors.length > 0 && <ul role="alert" className="conflict">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <button type="button" disabled={busy} onClick={submit}>ส่งรายงาน</button>
      </ConsentGate>
    </div>
  );
}
