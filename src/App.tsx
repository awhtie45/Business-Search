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
import { Icon, Logo } from './components/Icon';
import { GlobalSearch } from './components/GlobalSearch';
import { todayISO } from './lib/util';

type NavItem = { to: string; label: string; icon: string; end?: boolean };
const SECTIONS: { title?: string; items: NavItem[] }[] = [
  { items: [{ to: '/', label: 'Today', icon: 'home', end: true }] },
  { items: [{ to: '/businesses', label: 'Businesses', icon: 'building' }, { to: '/owners', label: 'Owners', icon: 'user' }] },
  { title: 'Field work', items: [{ to: '/map', label: 'Map', icon: 'map' }, { to: '/routes', label: 'Routes', icon: 'route' }] },
  { title: 'Data', items: [{ to: '/import', label: 'Import', icon: 'upload' }] },
];
const MOBILE_TABS: NavItem[] = [
  { to: '/', label: 'Today', icon: 'home', end: true },
  { to: '/businesses', label: 'Businesses', icon: 'building' },
  { to: '/map', label: 'Map', icon: 'map' },
  { to: '/routes', label: 'Routes', icon: 'route' },
];

function readCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('bizsearch:ui:collapsed') ?? '{}'); } catch { return {}; }
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { backend, businesses } = useStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);
  const toggle = (t: string) => setCollapsed((c) => {
    const n = { ...c, [t]: !c[t] };
    try { localStorage.setItem('bizsearch:ui:collapsed', JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const due = businesses.filter((b) => !b.ruled_out && b.next_action_date && b.next_action_date <= todayISO()).length;
  return (
    <>
      {open && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <nav className="side-nav">
          {SECTIONS.map((sec, i) => (
            <div key={i} className="side-section">
              {sec.title && (
                <button className="side-heading" onClick={() => toggle(sec.title!)} aria-expanded={!collapsed[sec.title]}>
                  <Icon name={collapsed[sec.title] ? 'chevronRight' : 'chevronDown'} size={16} />{sec.title}
                </button>
              )}
              {!(sec.title && collapsed[sec.title]) && sec.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className="side-link">
                  <Icon name={n.icon} />
                  <span className="grow">{n.label}</span>
                  {n.to === '/' && due > 0 && <span className="side-count">{due}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-bottom">
          <NavLink to="/settings" className="side-link"><Icon name="settings" /><span className="grow">Settings</span></NavLink>
          {backend.mode === 'local' ? (
            <div className="side-note">Saved in this browser · <NavLink to="/settings">Back up</NavLink></div>
          ) : (
            <button className="side-link" onClick={() => supabase?.auth.signOut()}><Icon name="logout" /><span className="grow">Sign out</span></button>
          )}
        </div>
      </aside>
    </>
  );
}

function Shell() {
  const { ready, loadError, reload, geocoding } = useStore();
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => setDrawer(false), [loc.pathname]);

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn hide-wide" onClick={() => setDrawer(!drawer)} aria-label="Menu"><Icon name="menu" /></button>
        <NavLink to="/" className="logo"><Logo /><span className="hide-mobile">Business Search</span></NavLink>
        {ready && <GlobalSearch />}
        <div className="top-actions">
          {geocoding.running && <span className="top-chip hide-mobile">Mapping {geocoding.remaining}…</span>}
          <NavLink to="/businesses/new" className="icon-btn" title="Add a business"><Icon name="plus" /></NavLink>
          <NavLink to="/import" className="icon-btn hide-mobile" title="Import"><Icon name="upload" /></NavLink>
          <NavLink to="/settings" className="icon-btn hide-mobile" title="Settings"><Icon name="settings" /></NavLink>
        </div>
      </header>
      <div className="frame">
        <Sidebar open={drawer} onClose={() => setDrawer(false)} />
        <main className="workspace">
          <div className="workspace-inner">
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
          </div>
        </main>
      </div>
      <nav className="bottomnav">
        {MOBILE_TABS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} size={22} />{n.label}</NavLink>
        ))}
        <button onClick={() => setDrawer(true)}><Icon name="menu" size={22} />More</button>
      </nav>
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
