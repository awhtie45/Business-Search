import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { localBackend, supabase, supabaseBackend, type Session } from './lib/backend';
import { StoreProvider, useStore } from './lib/store';
import { Toasts } from './components/ui';
import { Today } from './pages/Today';
import { Businesses } from './pages/Businesses';
import { BusinessDetail, NewBusiness } from './pages/BusinessDetail';
import { Import } from './pages/Import';
import { MapPage } from './pages/MapPage';
import { RoutePlanner } from './pages/RoutePlanner';
import { RouteRun } from './pages/RouteRun';
import { Owners } from './pages/Owners';
import { SettingsPage } from './pages/Settings';
import { Login } from './pages/Login';

const NAV = [
  { to: '/', label: 'Today', icon: '🏠', end: true },
  { to: '/businesses', label: 'Businesses', icon: '📋' },
  { to: '/map', label: 'Map', icon: '🗺️' },
  { to: '/routes', label: 'Routes', icon: '🚗' },
  { to: '/import', label: 'Import', icon: '⬆️' },
  { to: '/owners', label: 'Owners', icon: '👤' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

function Shell() {
  const { ready, loadError, reload, geocoding, backend } = useStore();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="logo">🔎 Business Search</NavLink>
        <nav className="topnav">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
        </nav>
        <span className="status">
          {geocoding.running ? `📍 Mapping ${geocoding.remaining}…` : backend.mode === 'local' ? 'Local mode' : ''}
        </span>
      </header>
      <main>
        {loadError ? (
          <div className="alert error">
            Couldn't load your data: {loadError}
            <div style={{ marginTop: 8 }}><button className="btn sm" onClick={reload}>Try again</button></div>
            <p className="small" style={{ marginTop: 8 }}>If this is a new Supabase project, make sure you ran <code>supabase/schema.sql</code> in the SQL editor.</p>
          </div>
        ) : !ready ? (
          <div className="empty">Loading…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/businesses" element={<Businesses />} />
            <Route path="/businesses/new" element={<NewBusiness />} />
            <Route path="/businesses/:id" element={<BusinessDetail />} />
            <Route path="/import" element={<Import />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/routes" element={<RoutePlanner />} />
            <Route path="/routes/:id" element={<RouteRun />} />
            <Route path="/owners" element={<Owners />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<div className="empty">Page not found.</div>} />
          </Routes>
        )}
      </main>
      <nav className="bottomnav">
        {NAV.slice(0, 4).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}><span className="ico">{n.icon}</span>{n.label}</NavLink>
        ))}
        <button onClick={() => setMore(!more)}><span className="ico">☰</span>More</button>
      </nav>
      {more && (
        <div className="more-menu">
          {NAV.slice(4).map((n) => <NavLink key={n.to} to={n.to}>{n.icon} {n.label}</NavLink>)}
        </div>
      )}
      <Toasts />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecked(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const backend = useMemo(() => (supabase ? (userId ? supabaseBackend(supabase) : null) : localBackend()), [userId]);

  if (!checked) return <div className="empty">Loading…</div>;
  if (!backend) return <Login />;
  return (
    <BrowserRouter>
      <StoreProvider key={userId ?? 'local'} backend={backend}>
        <Shell />
      </StoreProvider>
    </BrowserRouter>
  );
}
