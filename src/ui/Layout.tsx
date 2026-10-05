import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { Disclaimer } from './components/Disclaimer';
import { OfflineBanner } from './components/OfflineBanner';
import { OutboxBanner } from './components/OutboxBanner';
import { TruncatedBanner } from './components/TruncatedBanner';
import { useOptionalData } from '../state/SnapshotContext';
import { IconBasket, IconCamera, IconHome, IconMap, IconRoute, IconWaves } from './components/icons';

const tabs = [
  ['/', 'หน้าแรก', <IconHome />], ['/map', 'แผนที่', <IconMap />], ['/routes', 'เส้นทาง', <IconRoute />],
  ['/supply', 'เสบียง', <IconBasket />], ['/report', 'รายงาน', <IconCamera />],
] as const;

export function Layout() {
  const { pathname } = useLocation();
  const snapshot = useOptionalData()?.snapshot ?? null;
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__in">
          <span className="topbar__mark"><IconWaves /></span>
          <div><div className="topbar__name">น้ำท่วมหมู่บ้าน</div><div className="topbar__sub">ข้อมูลจากหน่วยงานและลูกบ้าน พร้อมเวลาอัปเดต</div></div>
        </div>
      </header>
      <OfflineBanner />
      {/* every page that shows status (home, map, routes, supply) must warn when the status fetch may be incomplete */}
      <TruncatedBanner truncated={!!snapshot && snapshot.statusTruncated !== false} />
      <main className="main">
        <ErrorBoundary key="outbox-banner"><OutboxBanner /></ErrorBoundary>
        <ErrorBoundary key={pathname}><Outlet /></ErrorBoundary>
      </main>
      <Disclaimer />
      <nav className="tabs">
        {tabs.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `tab${to === '/report' ? ' tab--cta' : ''}${isActive ? ' tab--on' : ''}`}>
            <span className="tab__ico">{icon}</span>{label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
