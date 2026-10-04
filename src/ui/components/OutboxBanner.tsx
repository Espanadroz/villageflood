import { useState } from 'react';
import { formatAgeTh } from '../../core/format';
import { KIND_LABEL_TH } from '../../core/labels';
import { describeSubmitError } from '../../data/submit';
import { useOutboxStatus } from '../../state/OutboxContext';

/** App-wide: queued reports and every report that could not be sent, so nothing a resident reported is hidden. */
export function OutboxBanner() {
  const { pendingCount, failed, retry, dismiss } = useOutboxStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (pendingCount === 0 && failed.length === 0 && !error) return null;

  const run = async (id: string, action: 'retry' | 'dismiss') => {
    if (action === 'dismiss' && !window.confirm('ลบรายงานนี้ออกจากเครื่อง? รายงานนี้จะไม่ถูกส่ง')) return;
    setBusy(id); setError(null);
    try { await (action === 'retry' ? retry(id) : dismiss(id)); }
    catch (e) { setError(`${action === 'retry' ? 'ส่งอีกครั้ง' : 'ลบออก'}ไม่สำเร็จ: ${(e as Error)?.message ?? String(e)}`); }
    finally { setBusy(null); }
  };

  return (
    <div className="banner banner--warn" role="status">
      {pendingCount > 0 && <p style={{ margin: 0 }}>มี {pendingCount} รายงานยังไม่ได้ส่ง — จะส่งให้อัตโนมัติเมื่อมีอินเทอร์เน็ต</p>}
      {failed.length > 0 && (
        <>
          <p style={{ margin: '6px 0 0' }}><b>รายงานที่ส่งไม่สำเร็จ ({failed.length})</b></p>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {failed.map((f) => {
              const kind = f.item?.draft?.kind;
              return (
                <li key={f.item.id} style={{ margin: '4px 0' }}>
                  {(kind && KIND_LABEL_TH[kind]) ?? 'รายงาน'} · {describeSubmitError(f.reason ?? '')} · บันทึกเมื่อ {formatAgeTh(Date.now() - f.item.createdAt)}{' '}
                  <button type="button" disabled={busy === f.item.id} onClick={() => run(f.item.id, 'retry')}>ส่งอีกครั้ง</button>{' '}
                  <button type="button" className="secondary" disabled={busy === f.item.id} onClick={() => run(f.item.id, 'dismiss')}>ลบออก</button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {error && <p role="alert" className="conflict" style={{ margin: '4px 0 0' }}>{error}</p>}
    </div>
  );
}
