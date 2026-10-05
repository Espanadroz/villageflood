import { useState } from 'react';
import { getDeviceId } from '../../data/device';
import type { FeedItem, Snapshot } from '../../data/types';
import { supabase } from '../../data/supabase';
import { describeSubmitError } from '../../data/submit';
import { describeFeedItem } from '../../state/describe';
import { useData } from '../../state/SnapshotContext';
import { STATUS_COLOR } from '../../core/labels';
import { AgeLabel } from './AgeLabel';
import { IconCamera, IconDroplet, IconMessage, IconRoad, IconBasket } from './icons';

const KIND_ICON = { road: <IconRoad />, water_level: <IconDroplet />, supply: <IconBasket />, general: <IconMessage /> } as const;

export function FeedItemCard({ item, snapshot, now }: { item: FeedItem; snapshot: Snapshot; now: number }) {
  const { reload } = useData();
  const { target, valueLabel } = describeFeedItem(item, snapshot);
  const ttl = item.kind === 'general' ? undefined : snapshot.settings?.ttlMs?.[item.kind];
  const expired = ttl !== undefined && now - item.createdAt >= ttl;
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
    <article className="card feed" style={item.kind === 'road' && item.value in STATUS_COLOR ? { borderLeftColor: STATUS_COLOR[item.value as keyof typeof STATUS_COLOR] } : undefined}>
      <header className="feed__top">
        <strong className="with-ico"><span className="with-ico__badge">{KIND_ICON[item.kind]}</span>{target}</strong><AgeLabel at={item.createdAt} now={now} />
      </header>
      <p>{valueLabel}{expired && <> <b className="conflict">หมดอายุแล้ว — ไม่ใช้ตัดสินสถานะ</b></>}</p>
      {item.mediaUrl && (item.mediaType?.startsWith('video')
        ? <video className="feed__media" src={item.mediaUrl} controls playsInline preload="none" />
        : <a href={item.mediaUrl} target="_blank" rel="noreferrer"><img className="feed__media" src={item.mediaUrl} alt={`หลักฐาน ${target}`} loading="lazy" /></a>)}
      <footer className="feed__meta">
        <span>โดย {item.nickname}</span>
        {item.mediaUrl && <span className="with-ico"><IconCamera />มีรูป/วิดีโอยืนยัน</span>}
        {(item.byCommittee || item.confirmedByCommittee) && <b className="tag tag--committee">กรรมการยืนยัน</b>}
        {item.confirmations > 0 && <span>· ผู้อื่นยืนยัน ({item.confirmations} คน)</span>}
        {!item.locationOk && !item.byCommittee && !item.confirmedByCommittee && <span className="tag tag--warn">ตำแหน่งไม่ตรง (ยังไม่มีผลต่อสถานะ)</span>}
        {item.kind !== 'general' && <button type="button" className="secondary" disabled={pending} aria-label={`ยืนยันรายงาน ${target}`} onClick={confirm} style={{ marginLeft: 'auto', minHeight: 40, padding: '4px 14px' }}>ยืนยัน</button>}
      </footer>
      {error && <p role="alert" className="conflict" style={{ margin: '6px 0 0' }}>{error}</p>}
    </article>
  );
}
