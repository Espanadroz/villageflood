import { useData } from '../../state/SnapshotContext';
import { AuthGate } from '../components/admin/AuthGate';
import { CommitteeNoteForm } from '../components/admin/CommitteeNoteForm';
import { ContentEditor } from '../components/admin/ContentEditor';
import { ModerationList } from '../components/admin/ModerationList';
import { SettingsForm } from '../components/admin/SettingsForm';

export function AdminPage() {
  const { snapshot, reload, now } = useData();
  return (
    <div className="page">
      <h1>กระดานกรรมการ</h1>
      <AuthGate>
        {(c) => (
          <>
            <p>เข้าสู่ระบบ: {c.email} <button type="button" className="secondary" onClick={c.signOut}>ออก</button></p>
            <CommitteeNoteForm nickname="กรรมการ" onDone={reload} />
            <ModerationList now={now} onChanged={reload} />
            {snapshot && <SettingsForm snapshot={snapshot} onDone={reload} />}
            {snapshot && <ContentEditor snapshot={snapshot} onDone={reload} />}
          </>
        )}
      </AuthGate>
    </div>
  );
}
