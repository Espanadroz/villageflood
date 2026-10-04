import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SnapshotProvider, useData } from '../state/SnapshotContext';
import { Layout } from './Layout';

function Gate({ children }: { children: React.ReactNode }) {
  const { snapshot, loading, error, reload } = useData();
  if (!snapshot && loading) return <p className="page">กำลังโหลดข้อมูล…</p>;
  if (!snapshot) return <div className="page"><p>โหลดข้อมูลไม่ได้ ({error?.message})</p><button onClick={reload}>ลองใหม่</button></div>;
  return <>{children}</>;
}

export function App() {
  return (
    <SnapshotProvider>
      <BrowserRouter>
        <Gate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<div className="page"><h1>พอร์ทัลน้ำท่วมหมู่บ้าน</h1></div>} />
            </Route>
          </Routes>
        </Gate>
      </BrowserRouter>
    </SnapshotProvider>
  );
}
