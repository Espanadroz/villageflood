import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from './AgeLabel';
import { IconAlert } from './icons';

export function OfflineBanner() {
  const { error, snapshot, now } = useData();
  if (!error) return null;
  return (
    <div className="banner banner--warn" role="status">
      <IconAlert />อัปเดตข้อมูลไม่ได้ในขณะนี้ — แสดงข้อมูลที่ได้ครั้งล่าสุด <AgeLabel at={snapshot ? snapshot.fetchedAt + snapshot.serverOffsetMs : null} now={now} />
    </div>
  );
}
