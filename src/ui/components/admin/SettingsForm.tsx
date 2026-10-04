import { useState } from 'react';
import { HOUR } from '../../../core/config';
import { buildSettingsRows, validateSettingsInput } from '../../../core/settingsInput';
import { supabase } from '../../../data/supabase';
import type { Snapshot } from '../../../data/types';

export function SettingsForm({ snapshot, onDone }: { snapshot: Snapshot; onDone: () => void }) {
  const s = snapshot.settings;
  const [road, setRoad] = useState(String(s.ttlMs.road / HOUR));
  const [water, setWater] = useState(String(s.ttlMs.water_level / HOUR));
  const [supply, setSupply] = useState(String(s.ttlMs.supply / HOUR));
  const [agency, setAgency] = useState(String(s.agencyMaxAgeMs / 60_000));
  const [watch, setWatch] = useState(String(s.gaugeThresholds['WL.STN.02']?.watch ?? ''));
  const [danger, setDanger] = useState(String(s.gaugeThresholds['WL.STN.02']?.danger ?? ''));
  const [origin, setOrigin] = useState(`${s.origin.lat}, ${s.origin.lng}`);
  const [msg, setMsg] = useState('');
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setMsg('');
    const input = { roadH: road, waterH: water, supplyH: supply, agencyMin: agency, watch, danger, origin };
    const e = validateSettingsInput(input);
    setErrs(e);
    if (e.length) return;
    setBusy(true);
    const rows = buildSettingsRows(input, s.gaugeThresholds);
    const { data, error } = await supabase.from('settings').upsert(rows).select();
    setBusy(false);
    if (error) return setErrs([`ไม่สำเร็จ: ${error.message}`]);
    if (!data || data.length < rows.length) return setErrs(['ไม่สำเร็จ: ระบบไม่ได้บันทึกข้อมูล (อาจไม่มีสิทธิ์)']);
    setMsg('บันทึกแล้ว'); onDone();
  };
  const num = (v: string, set: (n: string) => void, label: string) => (
    <label style={{ display: 'block' }}>{label} <input type="number" min={0.25} step={0.25} value={v} onChange={(e) => set(e.target.value)} /></label>
  );
  return (
    <section className="card">
      <h2>ตั้งค่า</h2>
      {num(road, setRoad, 'อายุสถานะถนน (ชม.)')}{num(water, setWater, 'อายุระดับน้ำ (ชม.)')}{num(supply, setSupply, 'อายุสถานะจุดเสบียง (ชม.)')}
      <label style={{ display: 'block' }}>ข้อมูลหน่วยงานถือว่าเก่าเมื่อเกิน (นาที) <input type="number" min={5} value={agency} onChange={(e) => setAgency(e.target.value)} /></label>
      <p>เกณฑ์เตือนเกจ WL.STN.02 (ค่าเดียวกับที่แสดงบนหน้าแรก; เว้นว่างทั้งคู่ = ไม่แสดงสี):</p>
      <label>เฝ้าระวัง ≥ <input value={watch} onChange={(e) => setWatch(e.target.value)} inputMode="decimal" /></label>{' '}
      <label>อันตราย ≥ <input value={danger} onChange={(e) => setDanger(e.target.value)} inputMode="decimal" /></label>
      <label style={{ display: 'block' }}>พิกัดทางออกหมู่บ้าน (lat, lng) <input value={origin} onChange={(e) => setOrigin(e.target.value)} style={{ width: '100%' }} /></label>
      {errs.length > 0 && <ul role="alert" className="conflict">{errs.map((m) => <li key={m}>{m}</li>)}</ul>}
      <button type="button" disabled={busy} onClick={save}>บันทึก</button> {msg}
    </section>
  );
}
