import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'flood.consent.v1';
const read = () => { try { return localStorage.getItem(KEY) === 'yes'; } catch { return false; } };

export function ConsentGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(read);
  if (ok) return <>{children}</>;
  return (
    <div className="card">
      <p>เมื่อส่งรายงาน ระบบจะเก็บ <b>ชื่อเล่น รูป/วิดีโอ และตำแหน่งขณะส่ง</b> ไว้ 30 วัน เพื่อใช้ยืนยันสถานะถนนในหมู่บ้าน
        โดยมีกรรมการหมู่บ้านเป็นผู้ดูแลข้อมูล อย่าถ่ายใบหน้า ป้ายทะเบียน หรือเลขที่บ้านของผู้อื่น</p>
      <p><Link to="/privacy">อ่านประกาศความเป็นส่วนตัว</Link></p>
      <button onClick={() => { try { localStorage.setItem(KEY, 'yes'); } catch { /* ignore */ } setOk(true); }}>ยอมรับและส่งรายงานต่อ</button>
    </div>
  );
}
