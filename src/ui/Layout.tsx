import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { Disclaimer } from './components/Disclaimer';
import { OfflineBanner } from './components/OfflineBanner';
import { OutboxBanner } from './components/OutboxBanner';
import { TruncatedBanner } from './components/TruncatedBanner';
import { useOptionalData } from '../state/SnapshotContext';

const tabs = [['/', 'หน้าแรก'], ['/map', 'แผนที่'], ['/routes', 'เส้นทาง'], ['/supply', 'เสบียง'], ['/report', 'รายงาน']] as const;

export function Layout() {
  const { pathname } = useLocation();
  const snapshot = useOptionalData()?.snapshot ?? null;
  return (
    <div className="app">
      <OfflineBanner />
      {/* every page that shows status (home, map, routes, supply) must warn when the status fetch may be incomplete */}
      <TruncatedBanner truncated={!!snapshot && snapshot.statusTruncated !== false} />
      <main className="main">
        <ErrorBoundary key="outbox-banner"><OutboxBanner /></ErrorBoundary>
        <ErrorBoundary key={pathname}><Outlet /></ErrorBoundary>
      </main>
      <Disclaimer />
      <nav className="tabs">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'tab tab--on' : 'tab')}>{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}
