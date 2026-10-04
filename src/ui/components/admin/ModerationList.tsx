import { useCallback, useEffect, useState } from 'react';
import { mediaUrl, supabase } from '../../../data/supabase';
import { AgeLabel } from '../AgeLabel';

interface Row { id: string; kind: string; target_id: string; value: string; nickname: string; device_id: string; created_at: string; location_ok: boolean; media_path: string | null; note: string | null; confirmed_by_committee: boolean; by_committee: boolean; deleted: boolean }

export function ModerationList({ now, onChanged }: { now: number; onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('reports').select('*').eq('deleted', false).order('created_at', { ascending: false }).limit(100);
    if (error) setMsg(`โหลดรายงานไม่สำเร็จ: ${error.message}`);
    setRows((data ?? []) as Row[]);
    const { data: devs } = await supabase.from('devices').select('id').eq('blocked', true);
    setBlocked(new Set((devs ?? []).map((d) => d.id)));
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, action: 'confirm' | 'delete') => {
    const { error } = await supabase.rpc('moderate_report', { p_report: id, p_action: action });
    setMsg(error ? `ไม่สำเร็จ: ${error.message}` : ''); load(); if (!error) onChanged?.();
  };
  const block = async (device: string, value: boolean) => {
    const { error } = await supabase.from('devices').update({ blocked: value }).eq('id', device);
    setMsg(error ? `ไม่สำเร็จ: ${error.message}` : ''); load();
  };

  return (
    <section>
      <h2>รายงานล่าสุด (ตรวจสอบ/ลบ/ยืนยัน)</h2>
      {msg && <p className="conflict">{msg}</p>}
      {rows.map((r) => (
        <article key={r.id} className="card" style={{ borderLeft: r.location_ok || r.confirmed_by_committee ? undefined : '6px solid #d73027' }}>
          <strong>{r.kind} · {r.target_id} · {r.value}</strong> <AgeLabel at={Date.parse(r.created_at)} now={now} />
          <p style={{ margin: '4px 0' }}>{r.nickname}{r.note ? ` — ${r.note}` : ''}{!r.location_ok && !r.confirmed_by_committee && !r.by_committee ? ' · ตำแหน่งไม่ตรง (ยังไม่มีผลต่อสถานะ)' : ''}</p>
          <p className="age" style={{ margin: '2px 0' }}>เครื่อง {r.device_id.slice(0, 8)}…</p>
          {r.media_path && <a href={mediaUrl(r.media_path)} target="_blank" rel="noreferrer">ดูหลักฐาน</a>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {!r.confirmed_by_committee && !r.by_committee && <button type="button" onClick={() => act(r.id, 'confirm')}>ยืนยัน</button>}
            <button type="button" className="secondary" onClick={() => act(r.id, 'delete')}>ลบ</button>
            <button type="button" className="secondary" onClick={() => block(r.device_id, !blocked.has(r.device_id))}>{blocked.has(r.device_id) ? 'ปลดบล็อกเครื่อง' : 'บล็อกเครื่อง'}</button>
          </div>
        </article>
      ))}
      {rows.length === 0 && <p className="age">ยังไม่มีรายงาน</p>}
    </section>
  );
}
