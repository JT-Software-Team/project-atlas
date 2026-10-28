import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Building2, ChevronsLeft, ChevronsRight, FileText, FolderKanban, History, LayoutGrid, LogOut, Menu,
  Search, Settings, Shapes, Star, UserCog, Users, UserCircle, Wrench, X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { ROLE_LABELS } from '../lib/catalog';
import { initials } from '../lib/format';
import type { Role } from '../lib/types';
import { BrandLink } from './Brand';

interface NavItem { to: string; label: string; icon: typeof LayoutGrid; roles?: Role[]; end?: boolean }

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
      { to: '/projects', label: 'All Projects', icon: FolderKanban, end: true },
      { to: '/clients', label: 'Clients', icon: Building2 },
      { to: '/categories', label: 'Categories', icon: Shapes },
      { to: '/favorites', label: 'Favorites', icon: Star },
      { to: '/recent', label: 'Recently Accessed', icon: History },
      { to: '/resources', label: 'Resources', icon: FileText },
    ],
  },
  {
    section: 'Administration',
    items: [
      { to: '/admin/projects', label: 'Project Management', icon: Wrench, roles: ['super_admin', 'project_admin'] },
      { to: '/admin/users', label: 'User Management', icon: Users, roles: ['super_admin', 'project_admin'] },
      { to: '/admin/settings', label: 'Settings', icon: Settings, roles: ['super_admin'] },
    ],
  },
];

interface Notification { id: string; tone: 'warning' | 'info' | 'error'; title: string; detail: string; projectSlug?: string }

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('atlas.sidebar') === 'collapsed'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<'user' | 'notifications' | null>(null);
  const [search, setSearch] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const notifications = useApi<{ notifications: Notification[] }>(`/notifications?r=${location.pathname === '/' ? 1 : 0}`);

  useEffect(() => { setMobileOpen(false); setMenu(null); window.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => {
    try { localStorage.setItem('atlas.sidebar', collapsed ? 'collapsed' : 'open'); } catch { /* storage unavailable */ }
  }, [collapsed]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setMobileOpen(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, []);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/projects${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`);
  };

  if (!user) return <Navigate to="/login" replace />;
  const notes = notifications.data?.notifications ?? [];
  const role = user.role;

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-top">
          <BrandLink />
          <button className="btn btn-ghost icon-btn btn-sm mobile-only" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav>
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.roles || i.roles.includes(role));
            if (!items.length) return null;
            return (
              <div key={group.section} className="nav-group">
                <div className="nav-section">{group.section}</div>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title={collapsed ? item.label : undefined}>
                    <item.icon size={18} aria-hidden="true" />
                    <span className="nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <Link to="/profile" className="sidebar-user" title={collapsed ? `${user.name}, ${ROLE_LABELS[role]}` : undefined}>
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="sidebar-user-text"><strong>{user.name}</strong><span>{ROLE_LABELS[role]}</span></span>
          </Link>
          <button className="nav-link desktop-only" style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            <span className="nav-label">Collapse sidebar</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="header">
          <button className="btn btn-ghost icon-btn mobile-only" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <form className="header-search" role="search" onSubmit={onSearch}>
            <div className="input-wrap">
              <Search size={17} aria-hidden="true" />
              <input className="input" type="search" placeholder="Search projects, clients, locations, tags…" aria-label="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </form>
          <div className="header-right" ref={menuRef}>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost icon-btn" aria-label={`Notifications${notes.length ? ` (${notes.length})` : ''}`} aria-expanded={menu === 'notifications'} onClick={() => setMenu(menu === 'notifications' ? null : 'notifications')}>
                <Bell size={19} />
                {notes.length > 0 && <span className="notif-badge">{notes.length}</span>}
              </button>
              {menu === 'notifications' && (
                <div className="menu" style={{ width: 320 }}>
                  <div className="subtle" style={{ padding: '8px 12px' }}>Notifications</div>
                  {notes.length === 0 && <div className="subtle" style={{ padding: '6px 12px 12px' }}>You're all caught up. Maintenance and review reminders appear here.</div>}
                  {notes.map((n) => (
                    <Link key={n.id} to={n.projectSlug ? `/projects/${n.projectSlug}` : '/'} className="menu-item" style={{ alignItems: 'flex-start' }}>
                      <span className={`badge badge-${n.tone === 'error' ? 'error' : n.tone === 'warning' ? 'warning' : 'info'}`} style={{ marginTop: 2 }}>{n.tone === 'error' ? 'Alert' : n.tone === 'warning' ? 'Notice' : 'Info'}</span>
                      <span><strong style={{ display: 'block', fontSize: '0.86rem' }}>{n.title}</strong><span className="subtle">{n.detail}</span></span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button className="user-btn" aria-haspopup="menu" aria-expanded={menu === 'user'} onClick={() => setMenu(menu === 'user' ? null : 'user')}>
                <span className="avatar" aria-hidden="true">{initials(user!.name)}</span>
                <span className="user-meta"><strong>{user!.name}</strong><span>{ROLE_LABELS[role]}</span></span>
              </button>
              {menu === 'user' && (
                <div className="menu" role="menu">
                  <div style={{ padding: '10px 12px' }}>
                    <strong style={{ display: 'block' }}>{user!.name}</strong>
                    <span className="subtle">{user!.email}</span>
                    <div style={{ marginTop: 8 }}><span className="badge badge-accent"><UserCog size={12} />{ROLE_LABELS[role]}</span></div>
                  </div>
                  <div className="menu-sep" />
                  <Link to="/profile" className="menu-item" role="menuitem"><UserCircle size={17} />Profile &amp; security</Link>
                  <button className="menu-item" role="menuitem" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}><LogOut size={17} />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="content page-enter" key={location.pathname}>
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} Janyutech — Project Atlas</span>
          <span>Industrial Intelligence &amp; Monitoring Portal</span>
        </footer>
      </div>
    </div>
  );
}
