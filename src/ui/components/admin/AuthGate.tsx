import { useState, type ReactNode } from 'react';
import { useCommittee } from '../../../state/useCommittee';

export function AuthGate({ children }: { children: (c: ReturnType<typeof useCommittee>) => ReactNode }) {
  const c = useCommittee();
  const [addr, setAddr] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  if (c.loading) return <p>กำลังตรวจสอบ…</p>;
  if (!c.email) {
    return (
      <div className="card">
        <p>สำหรับกรรมการหมู่บ้าน — กรอกอีเมลเพื่อรับลิงก์เข้าสู่ระบบ</p>
        <input type="email" aria-label="อีเมล" value={addr} onChange={(e) => setAddr(e.target.value)} style={{ width: '100%', minHeight: 44 }} />
        <button type="button" onClick={async () => { try { setErr(''); await c.signIn(addr); setSent(true); } catch (e) { setErr((e as Error).message); } }}>ส่งลิงก์</button>
        {sent && <p>ส่งลิงก์ไปที่อีเมลแล้ว</p>}{err && <p className="conflict">{err}</p>}
      </div>
    );
  }
  if (!c.isCommittee) return <div className="card"><p>บัญชี {c.email} ยังไม่ได้รับสิทธิ์กรรมการ</p><button type="button" className="secondary" onClick={c.signOut}>ออกจากระบบ</button></div>;
  return <>{children(c)}</>;
}
