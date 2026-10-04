import { Suspense } from 'react';
import { lazyRetry } from './ErrorBoundary';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SnapshotProvider, useData } from '../state/SnapshotContext';
import { OutboxProvider } from '../state/OutboxContext';
import { Layout } from './Layout';
import { HomePage } from './pages/HomePage';
import { ReportPage } from './pages/ReportPage';
import { SupplyPage } from './pages/SupplyPage';
import { PrivacyPage } from './pages/PrivacyPage';
const MapPage = lazyRetry(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));
const RoutesPage = lazyRetry(() => import('./pages/RoutesPage').then((m) => ({ default: m.RoutesPage })));
const AdminPage = lazyRetry(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

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
              <Route index element={<HomePage />} />
              <Route path="report" element={<ReportPage />} />
              <Route path="supply" element={<SupplyPage />} />
              <Route path="privacy" element={<PrivacyPage />} />
              <Route path="map" element={<Suspense fallback={<p className="page">กำลังโหลดแผนที่…</p>}><MapPage /></Suspense>} />
              <Route path="routes" element={<Suspense fallback={<p className="page">กำลังโหลดแผนที่…</p>}><RoutesPage /></Suspense>} />
              <Route path="admin" element={<Suspense fallback={<p className="page">กำลังโหลด…</p>}><AdminPage /></Suspense>} />
            </Route>
          </Routes>
        </Gate>
      </BrowserRouter>
      </OutboxProvider>
    </SnapshotProvider>
  );
}
