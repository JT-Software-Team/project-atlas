import { Link } from 'react-router-dom';
import {
  Activity as ActivityIcon, ArrowRight, Building2, CheckCircle2, Clock, FolderKanban, History, LayoutDashboard,
  PlayCircle, Plus, Wrench,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import type { Activity, ProjectCard } from '../lib/types';
import { timeAgo } from '../lib/format';
import { CoverImage } from '../components/Media';
import { Alert, ErrorState, PageHeader, StateMessage, StatusBadge } from '../components/ui';

interface Overview {
  stats: {
    totalProjects: number; totalClients: number; activeProjects: number; completedProjects: number;
    underMaintenance: number; recentlyUpdated: number; dashboards: number; demoProjects: number;
  };
  recentProjects: ProjectCard[];
  featured: ProjectCard[];
  recentlyAccessed: ProjectCard[];
  activity: Activity[];
}

export function ActivityList({ items, empty }: { items: Activity[]; empty?: string }) {
  if (!items.length) return <p className="subtle">{empty ?? 'No activity has been recorded yet.'}</p>;
  return (
    <ul className="activity">
      {items.map((a) => {
        const tone = a.action.startsWith('access.') || a.action.startsWith('user.') ? 'warn' : a.action.startsWith('dashboard.') ? 'cyan' : '';
        return (
          <li key={a.id}>
            <span className={`activity-icon ${tone}`} aria-hidden="true"><ActivityIcon size={15} /></span>
            <div>
              <div className="activity-text">{a.summary}</div>
              <div className="activity-meta">{a.userName ?? 'System'} — <time dateTime={a.at} title={new Date(a.at).toLocaleString()}>{timeAgo(a.at)}</time></div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MiniProject({ p, meta }: { p: ProjectCard; meta: string }) {
  return (
    <Link to={`/projects/${p.slug}`} className="mini-item">
      <span className="mini-thumb"><CoverImage src={p.coverUrl} categorySlug={p.category?.slug} /></span>
      <span className="mini-body"><strong>{p.name}</strong><span>{p.client?.name ?? 'Client to be added'} — {meta}</span></span>
      <StatusBadge status={p.status} />
    </Link>
  );
}

export function OverviewPage() {
  const { user, isSuperAdmin } = useAuth();
  const { data, error, loading, reload } = useApi<Overview>('/overview');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const stats = data?.stats;
  // Mint marks the headline figures, amber the ones that need attention, cyan recent change.
  const cards = [
    { label: 'Total Projects', value: stats?.totalProjects, icon: FolderKanban, to: '/projects', fg: 'var(--accent)' },
    { label: 'Client Companies', value: stats?.totalClients, icon: Building2, to: '/clients', fg: 'var(--text-2)' },
    { label: 'Active Projects', value: stats?.activeProjects, icon: PlayCircle, to: '/projects?status=active', fg: 'var(--accent)' },
    { label: 'Completed', value: stats?.completedProjects, icon: CheckCircle2, to: '/projects?status=completed', fg: 'var(--text-2)' },
    { label: 'Under Maintenance', value: stats?.underMaintenance, icon: Wrench, to: '/projects?status=under_maintenance', fg: 'var(--warning)' },
    { label: 'Updated (30 days)', value: stats?.recentlyUpdated, icon: Clock, to: '/projects?sort=updated', fg: 'var(--cyan)' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`${greeting}, ${user!.name.split(' ')[0]}`}
        description="Janyutech industrial projects and their monitoring dashboards. Figures count only the project records you are authorised to see."
      />

      {error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          {stats && stats.demoProjects > 0 && (
            <div style={{ marginBottom: 18 }}>
              <Alert tone="warning">
                {stats.demoProjects} of the projects shown {stats.demoProjects === 1 ? 'is' : 'are'} <strong>demo data</strong> with sample statuses and placeholder images.
                {isSuperAdmin ? <> Replace them with real details in <Link to="/admin/projects">Project Management</Link>.</> : ' Real project information will replace them.'}
              </Alert>
            </div>
          )}
          <section className="stats" aria-label="Summary statistics" aria-busy={loading}>
            {cards.map((c) => (
              <Link key={c.label} to={c.to} className="stat" style={{ '--stat-fg': c.fg } as React.CSSProperties}>
                <div className="stat-top"><span>{c.label}</span><span className="stat-icon"><c.icon size={16} aria-hidden="true" /></span></div>
                {loading && !data ? <div className="skeleton" style={{ height: 30, width: 60, marginTop: 8 }} /> : <div className="stat-value">{c.value ?? 0}</div>}
              </Link>
            ))}
          </section>

          <div className="grid-2">
            <div className="stack">
              <section className="panel">
                <div className="panel-header">
                  <h2><FolderKanban size={18} aria-hidden="true" />Recently updated projects</h2>
                  <Link to="/projects" className="btn btn-sm btn-ghost">View all <ArrowRight size={14} /></Link>
                </div>
                {loading && !data ? <div className="skeleton" style={{ height: 180 }} /> : data!.recentProjects.length ? (
                  <div className="mini-list">{data!.recentProjects.map((p) => <MiniProject key={p.id} p={p} meta={`updated ${timeAgo(p.updatedAt)}`} />)}</div>
                ) : (
                  <StateMessage
                    icon={<FolderKanban size={28} />}
                    title="No projects yet"
                    message={isSuperAdmin ? 'Add your first project to start building the directory.' : 'No projects have been shared with you yet. Contact your administrator if you expected to see one.'}
                    action={isSuperAdmin && <Link to="/admin/projects/new" className="btn btn-primary"><Plus size={16} />Add project</Link>}
                  />
                )}
              </section>
              {data && data.recentlyAccessed.length > 0 && (
                <section className="panel">
                  <div className="panel-header">
                    <h2><History size={18} aria-hidden="true" />Recently accessed</h2>
                    <Link to="/recent" className="btn btn-sm btn-ghost">View all <ArrowRight size={14} /></Link>
                  </div>
                  <div className="mini-list">{data.recentlyAccessed.map((p) => <MiniProject key={p.id} p={p} meta={`opened ${timeAgo(p.lastAccessedAt)}`} />)}</div>
                </section>
              )}
            </div>
            <div className="stack">
              <section className="panel">
                <div className="panel-header">
                  <h2><LayoutDashboard size={18} aria-hidden="true" />Dashboards</h2>
                </div>
                <div className="stat-value" style={{ marginTop: 0 }}>{stats?.dashboards ?? '—'}</div>
                <p className="subtle" style={{ marginTop: 6 }}>Dashboard links configured across your projects. Project Atlas opens them on their own platforms and does not report live machine health.</p>
              </section>
              <section className="panel">
                <div className="panel-header">
                  <h2><ActivityIcon size={18} aria-hidden="true" />Recent activity</h2>
                  {isSuperAdmin && <Link to="/admin/settings?tab=activity" className="btn btn-sm btn-ghost">Full log <ArrowRight size={14} /></Link>}
                </div>
                {loading && !data ? <div className="skeleton" style={{ height: 200 }} /> : <ActivityList items={data!.activity} />}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
