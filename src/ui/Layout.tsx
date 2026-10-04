import { NavLink, Outlet } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { Disclaimer } from './components/Disclaimer';
import { OfflineBanner } from './components/OfflineBanner';

const tabs = [['/', 'หน้าแรก'], ['/map', 'แผนที่'], ['/routes', 'เส้นทาง'], ['/supply', 'เสบียง'], ['/report', 'รายงาน']] as const;

export function Layout() {
  return (
    <div className="app">
      <OfflineBanner />
      <main className="main"><ErrorBoundary><Outlet /></ErrorBoundary></main>
      <Disclaimer />
      <nav className="tabs">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'tab tab--on' : 'tab')}>{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}
