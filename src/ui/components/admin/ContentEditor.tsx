import { useState } from 'react';
import { CONTENT_ENTITIES, validateContentRow, type ContentEntity } from '../../../core/validateContent';
import { supabase } from '../../../data/supabase';
import type { Snapshot } from '../../../data/types';

const TEMPLATES: Record<ContentEntity, string> = {
  segments: '{ "id": "seg-soi-1", "name": "ซอย 1", "sort": 1, "geojson": { "type": "LineString", "coordinates": [[100.738, 13.7765], [100.740, 13.7775]] } }',
  water_marks: '{ "id": "mark-wall-1", "name": "กำแพงริมคลองจุด 1", "geojson": { "type": "Point", "coordinates": [100.7385, 13.7768] }, "levels": [{ "level": 1, "label": "ขีดที่ 1" }, { "level": 2, "label": "ขีดที่ 2" }] }',
  places: '{ "id": "place-1", "name": "ร้าน...", "category": "store", "geojson": { "type": "Point", "coordinates": [100.742, 13.778] } }',
  destinations: '{ "id": "dest-city", "name": "เข้าเมือง", "kind": "city", "lat": 13.7563, "lng": 100.5018 }',
  routes: '{ "id": "route-1", "name": "ทางร่มเกล้า-ลาดกระบัง", "destination_id": "dest-city", "segment_ids": ["seg-soi-1"], "waypoints": [{ "lat": 13.75, "lng": 100.6 }], "distance_m": 18000 }',
};

export function ContentEditor({ snapshot, onDone }: { snapshot: Snapshot; onDone: () => void }) {
  const [entity, setEntity] = useState<ContentEntity>('segments');
  const [text, setText] = useState(TEMPLATES.segments);
  const [msgs, setMsgs] = useState<string[]>([]);
  const save = async () => {
    let row: any;
    try { row = JSON.parse(text); } catch { return setMsgs(['JSON ไม่ถูกต้อง']); }
    const errs = validateContentRow(entity, row, snapshot.segments.map((s) => s.id));
    if (errs.length) return setMsgs(errs);
    const existing: { id: string }[] =
      entity === 'segments' ? snapshot.segments : entity === 'water_marks' ? snapshot.marks : entity === 'places' ? snapshot.places
      : entity === 'destinations' ? snapshot.destinations : snapshot.routes;
    if (existing.some((x) => x.id === row.id) && !confirm('มี id นี้อยู่แล้ว — จะเขียนทับรายการเดิม ต้องการทำต่อหรือไม่?')) return;
    const { error } = await supabase.from(entity).upsert(row);
    setMsgs([error ? `ไม่สำเร็จ: ${error.message}` : 'บันทึกแล้ว']); if (!error) onDone();
  };
  const remove = async () => {
    let id: string | undefined; try { id = JSON.parse(text).id; } catch { /* ignore */ }
    if (!id) return setMsgs(['ต้องมี id ใน JSON เพื่อลบ']);
    const warn = entity === 'segments' ? '\nเส้นทางที่ใช้ช่วงถนนนี้จะแสดงเป็น "ไม่ทราบ"' : '';
    if (!confirm(`ลบ ${entity}: ${id}?${warn}`)) return;
    const { error } = await supabase.from(entity).delete().eq('id', id);
    setMsgs([error ? `ไม่สำเร็จ: ${error.message}` : 'ลบแล้ว']); if (!error) onDone();
  };
  return (
    <section className="card">
      <h2>จัดการข้อมูลแผนที่ (JSON)</h2>
      <p className="age">วาดเส้นถนน/จุดบน geojson.io แล้ววาง geometry (พิกัดเรียง [lng, lat]) — รายการหลายชิ้นใช้สคริปต์ <code>scripts/import-geo.mjs</code></p>
      <select value={entity} onChange={(e) => { const v = e.target.value as ContentEntity; setEntity(v); setText(TEMPLATES[v]); setMsgs([]); }} style={{ minHeight: 44 }}>
        {CONTENT_ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
      </select>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} style={{ width: '100%', fontFamily: 'monospace' }} />
      <button type="button" onClick={save}>บันทึก</button> <button type="button" className="secondary" onClick={remove}>ลบตาม id</button>
      <ul>{msgs.map((m) => <li key={m}>{m}</li>)}</ul>
    </section>
  );
}
