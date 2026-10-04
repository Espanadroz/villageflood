import { useRef, useState } from 'react';
import { getDeviceId } from '../../../data/device';
import { describeSubmitError } from '../../../data/submit';
import { newId } from '../../../lib/uuid';
import { supabase } from '../../../data/supabase';

export function CommitteeNoteForm({ nickname, onDone }: { nickname: string; onDone: () => void }) {
  const [target, setTarget] = useState<'wall' | 'drainage'>('wall');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string | null>(null); // reused for retries of the same note so a double submit is idempotent
  const send = async () => {
    if (busy) return;
    clientId.current ??= newId();
    setBusy(true); setMsg('');
    const { error } = await supabase.rpc('submit_report', {
      p_device: getDeviceId(), p_nickname: nickname || 'กรรมการ', p_kind: 'general', p_target: target, p_value: 'note',
      p_lat: null, p_lng: null, p_media_path: null, p_media_type: null, p_note: note, p_client_id: clientId.current,
    });
    setBusy(false);
    setMsg(error ? `ไม่สำเร็จ: ${describeSubmitError(error.message)}` : 'บันทึกแล้ว'); if (!error) { setNote(''); clientId.current = null; onDone(); }
  };
  return (
    <section className="card">
      <h2>อัปเดตกำแพง/การระบายน้ำ</h2>
      <select value={target} onChange={(e) => setTarget(e.target.value as 'wall' | 'drainage')} style={{ minHeight: 44 }}>
        <option value="wall">กำแพงริมคลอง</option><option value="drainage">การระบายน้ำ/เครื่องสูบ</option>
      </select>
      <textarea value={note} onChange={(e) => { setNote(e.target.value); clientId.current = null; }} rows={3} style={{ width: '100%' }} placeholder="เช่น น้ำเสมอขีดที่ 2 กำลังสูบน้ำออก" />
      <button type="button" disabled={busy || !note.trim()} onClick={send}>บันทึก</button> <span role="status">{msg}</span>
      <p className="age">การแก้ทับสถานะถนนของกรรมการ: ส่งรายงานปกติที่หน้า "รายงาน" ขณะล็อกอินอยู่ ระบบจะติดป้าย "กรรมการ" ให้เอง (ยังต้องแนบรูปถ้าเป็นสถานะ "ไปได้")</p>
    </section>
  );
}
