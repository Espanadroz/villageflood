import { useState } from 'react';
import { HOUR } from '../../../core/config';
import { supabase } from '../../../data/supabase';
import type { Snapshot } from '../../../data/types';

export function SettingsForm({ snapshot, onDone }: { snapshot: Snapshot; onDone: () => void }) {
  const s = snapshot.settings;
  const [road, setRoad] = useState(s.ttlMs.road / HOUR);
  const [water, setWater] = useState(s.ttlMs.water_level / HOUR);
  const [supply, setSupply] = useState(s.ttlMs.supply / HOUR);
  const [agency, setAgency] = useState(s.agencyMaxAgeMs / 60_000);
  const [watch, setWatch] = useState(String(s.gaugeThresholds['WL.STN.02']?.watch ?? ''));
  const [danger, setDanger] = useState(String(s.gaugeThresholds['WL.STN.02']?.danger ?? ''));
  const [origin, setOrigin] = useState(`${s.origin.lat}, ${s.origin.lng}`);
  const [msg, setMsg] = useState('');

  const save = async () => {
    const [lat, lng] = origin.split(',').map((x) => Number(x.trim()));
    const th = { ...s.gaugeThresholds };
    if (watch !== '' && danger !== '' && Number(watch) < Number(danger)) th['WL.STN.02'] = { watch: Number(watch), danger: Number(danger) }; else delete th['WL.STN.02'];
    const rows = [
      { key: 'ttl_ms', value: { road: road * HOUR, water_level: water * HOUR, supply: supply * HOUR } },
      { key: 'agency_max_age_ms', value: agency * 60_000 },
      { key: 'gauge_thresholds', value: th },
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? [{ key: 'origin', value: { lat, lng } }] : []),
    ];
    const { error } = await supabase.from('settings').upsert(rows);
    setMsg(error ? `ไม่สำเร็จ: ${error.message}` : 'บันทึกแล้ว'); if (!error) onDone();
  };
  const num = (v: number, set: (n: number) => void, label: string) => (
    <label style={{ display: 'block' }}>{label} <input type="number" min={0.25} step={0.25} value={v} onChange={(e) => set(Number(e.target.value))} /></label>
  );
  return (
    <section className="card">
      <h2>ตั้งค่า</h2>
      {num(road, setRoad, 'อายุสถานะถนน (ชม.)')}{num(water, setWater, 'อายุระดับน้ำ (ชม.)')}{num(supply, setSupply, 'อายุสถานะจุดเสบียง (ชม.)')}
      <label style={{ display: 'block' }}>ข้อมูลหน่วยงานถือว่าเก่าเมื่อเกิน (นาที) <input type="number" min={5} value={agency} onChange={(e) => setAgency(Number(e.target.value))} /></label>
      <p>เกณฑ์เตือนเกจ WL.STN.02 (ค่าเดียวกับที่แสดงบนหน้าแรก; เว้นว่างทั้งคู่ = ไม่แสดงสี):</p>
      <label>เฝ้าระวัง ≥ <input value={watch} onChange={(e) => setWatch(e.target.value)} inputMode="decimal" /></label>{' '}
      <label>อันตราย ≥ <input value={danger} onChange={(e) => setDanger(e.target.value)} inputMode="decimal" /></label>
      <label style={{ display: 'block' }}>พิกัดทางออกหมู่บ้าน (lat, lng) <input value={origin} onChange={(e) => setOrigin(e.target.value)} style={{ width: '100%' }} /></label>
      <button type="button" onClick={save}>บันทึก</button> {msg}
    </section>
  );
}
