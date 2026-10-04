import { useState } from 'react';
import { getDeviceId } from '../../data/device';
import type { FeedItem, Snapshot } from '../../data/types';
import { supabase } from '../../data/supabase';
import { describeSubmitError } from '../../data/submit';
import { describeFeedItem } from '../../state/describe';
import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from './AgeLabel';

export function FeedItemCard({ item, snapshot, now }: { item: FeedItem; snapshot: Snapshot; now: number }) {
  const { reload } = useData();
  const { target, valueLabel } = describeFeedItem(item, snapshot);
  const ttl = item.kind === 'general' ? undefined : snapshot.settings?.ttlMs?.[item.kind];
  const expired = ttl !== undefined && now - item.createdAt > ttl;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setPending(true); setError(null);
    try {
      const { error: err } = await supabase.rpc('confirm_report', { p_device: getDeviceId(), p_report: item.id });
      if (err) setError(describeSubmitError(err.message)); else reload();
    } catch (e) {
      setError(describeSubmitError(e instanceof Error ? e.message : String(e)));
    } finally { setPending(false); }
  };
  return (
    <article className="card">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{target}</strong><AgeLabel at={item.createdAt} now={now} />
      </header>
      <p style={{ margin: '4px 0' }}>{valueLabel}{expired && <> <b className="conflict">หมดอายุแล้ว — ไม่ใช้ตัดสินสถานะ</b></>}</p>
      {item.mediaUrl && (item.mediaType?.startsWith('video')
        ? <video src={item.mediaUrl} controls playsInline preload="none" style={{ width: '100%', borderRadius: 8 }} />
        : <a href={item.mediaUrl} target="_blank" rel="noreferrer"><img src={item.mediaUrl} alt={`หลักฐาน ${target}`} loading="lazy" style={{ width: '100%', borderRadius: 8 }} /></a>)}
      <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
        <span>โดย {item.nickname}</span>
        {item.mediaUrl && <span>· มีรูป/วิดีโอยืนยัน</span>}
        {(item.byCommittee || item.confirmedByCommittee) && <b>· กรรมการยืนยัน</b>}
        {item.confirmations > 0 && <span>· ผู้อื่นยืนยัน ({item.confirmations} คน)</span>}
        {!item.locationOk && !item.byCommittee && !item.confirmedByCommittee && <span className="conflict">· ตำแหน่งไม่ตรง (ยังไม่มีผลต่อสถานะ)</span>}
        {item.kind !== 'general' && <button type="button" className="secondary" disabled={pending} aria-label={`ยืนยันรายงาน ${target}`} onClick={confirm} style={{ marginLeft: 'auto', minHeight: 36, padding: '4px 10px' }}>ยืนยัน</button>}
      </footer>
      {error && <p role="alert" className="conflict" style={{ margin: '6px 0 0' }}>{error}</p>}
    </article>
  );
}
