import { useCallback, useEffect, useState } from 'react';
import { mediaUrl, supabase } from '../../../data/supabase';
import { AgeLabel } from '../AgeLabel';

interface Row { id: string; kind: string; target_id: string; value: string; nickname: string; device_id: string; created_at: string; location_ok: boolean; media_path: string | null; note: string | null; confirmed_by_committee: boolean; by_committee: boolean; deleted: boolean }

export function ModerationList({ now, onChanged }: { now: number; onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [errs, setErrs] = useState<string[]>([]);
  const load = useCallback(async () => {
    const problems: string[] = [];
    const { data, error } = await supabase.from('reports').select('*').eq('deleted', false).order('created_at', { ascending: false }).limit(100);
    if (error) problems.push(`โหลดรายงานไม่สำเร็จ: ${error.message}`); else setRows((data ?? []) as Row[]);
    const { data: devs, error: devErr } = await supabase.from('devices').select('id').eq('blocked', true);
    if (devErr) problems.push(`โหลดรายการเครื่องที่ถูกบล็อกไม่สำเร็จ: ${devErr.message}`); else setBlocked(new Set((devs ?? []).map((d) => d.id)));
    setErrs((prev) => [...prev.filter((m) => !m.startsWith('โหลด')), ...problems]);
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, action: 'confirm' | 'delete') => {
    if (action === 'delete' && !confirm('ลบรายงานนี้?')) return;
    const { error } = await supabase.rpc('moderate_report', { p_report: id, p_action: action });
    if (error) { setErrs([`ไม่สำเร็จ: ${error.message}`]); return; }
    const problems: string[] = [];
    const path = rows.find((r) => r.id === id)?.media_path;
    if (action === 'delete' && path) {
      // best effort: the report is already soft-deleted; the public evidence file must go too
      try {
        const res = await supabase.storage.from('evidence').remove([path]);
        if (res.error || !res.data || res.data.length === 0) {
          problems.push(`ลบรายงานแล้ว แต่ลบไฟล์หลักฐานไม่สำเร็จ (${path}): ${res.error?.message ?? 'ไม่พบไฟล์หรือไม่มีสิทธิ์'}`);
        }
      } catch (e) {
        problems.push(`ลบรายงานแล้ว แต่ลบไฟล์หลักฐานไม่สำเร็จ (${path}): ${(e as Error)?.message ?? String(e)}`);
      }
    }
    setErrs(problems); await load(); onChanged?.();
  };
  const block = async (device: string, value: boolean) => {
    const { data, error } = await supabase.from('devices').update({ blocked: value }).eq('id', device).select('id');
    if (error) { setErrs([`ไม่สำเร็จ: ${error.message}`]); return; }
    if (!data || data.length === 0) { setErrs(['ไม่สำเร็จ: ไม่พบเครื่องนี้หรือไม่มีสิทธิ์แก้ไข']); return; }
    setErrs([]); load();
  };

  return (
    <section>
      <h2>รายงานล่าสุด (ตรวจสอบ/ลบ/ยืนยัน)</h2>
      {errs.length > 0 && <ul role="alert" className="conflict">{errs.map((m) => <li key={m}>{m}</li>)}</ul>}
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
