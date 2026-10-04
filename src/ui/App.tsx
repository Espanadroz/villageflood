import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SnapshotProvider, useData } from '../state/SnapshotContext';
import { OutboxProvider } from '../state/OutboxContext';
import { Layout } from './Layout';
import { ReportPage } from './pages/ReportPage';
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));

import { Disclaimer } from './components/Disclaimer';
import type { Snapshot } from '../data/types';

interface GateProps { snapshot: Snapshot | null; loading: boolean; error: Error | null; reload(): void; children: React.ReactNode }

export function GateView({ snapshot, loading, error, reload, children }: GateProps) {
  if (!snapshot && loading) return <div className="page"><p>กำลังโหลดข้อมูล…</p><Disclaimer /></div>;
  if (!snapshot) return <div className="page"><p>โหลดข้อมูลไม่ได้ ({error?.message})</p><button onClick={reload}>ลองใหม่</button><Disclaimer /></div>;
  return <>{children}</>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const d = useData();
  return <GateView snapshot={d.snapshot} loading={d.loading} error={d.error} reload={d.reload}>{children}</GateView>;
}

export function App() {
  return (
    <SnapshotProvider>
      <OutboxProvider>
      <BrowserRouter>
        <Gate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<div className="page"><h1>พอร์ทัลน้ำท่วมหมู่บ้าน</h1></div>} />
              <Route path="report" element={<ReportPage />} />
              <Route path="map" element={<Suspense fallback={<p className="page">กำลังโหลดแผนที่…</p>}><MapPage /></Suspense>} />
            </Route>
          </Routes>
        </Gate>
      </BrowserRouter>
      </OutboxProvider>
    </SnapshotProvider>
  );
}
