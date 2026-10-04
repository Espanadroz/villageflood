import { useData } from '../../state/SnapshotContext';
import { AgeLabel } from './AgeLabel';

export function OfflineBanner() {
  const { error, snapshot, now } = useData();
  if (!error) return null;
  return (
    <div className="banner banner--warn" role="status">
      อัปเดตข้อมูลไม่ได้ในขณะนี้ — แสดงข้อมูลที่ได้ครั้งล่าสุด <AgeLabel at={snapshot ? snapshot.fetchedAt + snapshot.serverOffsetMs : null} now={now} />
    </div>
  );
}
