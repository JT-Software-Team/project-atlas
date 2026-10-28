import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Calendar, ExternalLink, FileText, Globe, Image as ImageIcon, Info, KeyRound, LayoutDashboard, Lock,
  MapPin, Pencil, ShieldCheck, Star, User, Wrench, Cpu, Clock,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useFavoriteToggle } from '../hooks/useFavorite';
import { api } from '../lib/api';
import { DASHBOARD_TYPES, TECHNICAL_LABELS } from '../lib/catalog';
import { formatBytes, formatDate, formatDateTime, locationText, timeAgo } from '../lib/format';
import type { Activity, Dashboard, MediaInfo, ProjectDetail } from '../lib/types';
import { ClientLogo, CoverImage } from '../components/Media';
import { DemoBadge, ErrorState, Modal, StateMessage, StatusBadge } from '../components/ui';
import { ActivityList } from './OverviewPage';

export function DashboardRow({ d }: { d: Dashboard }) {
  const newTab = d.openIn === 'new_tab';
  return (
    <div className={`dash-item ${d.isPrimary ? 'primary' : ''}`}>
      <span className="dash-icon">{d.thumbnailUrl ? <img src={d.thumbnailUrl} alt="" /> : <LayoutDashboard size={22} aria-hidden="true" />}</span>
      <div style={{ minWidth: 0 }}>
        <div className="dash-title">
          {d.name}
          {d.isPrimary && <span className="badge badge-info">Primary</span>}
          <span className="badge">{DASHBOARD_TYPES[d.type] ?? d.type}</span>
        </div>
        {d.description && <p className="muted" style={{ fontSize: '0.86rem', marginTop: 4 }}>{d.description}</p>}
        <div className="dash-sub">
          <span title="This dashboard is hosted outside Project Atlas"><Globe size={13} aria-hidden="true" />External — {d.provider ? `${d.provider} — ` : ''}{d.host}</span>
          {d.requiresSeparateLogin && <span><KeyRound size={13} aria-hidden="true" />May require a separate sign-in</span>}
          <span><Clock size={13} aria-hidden="true" />{d.lastVerifiedAt ? `Link checked ${timeAgo(d.lastVerifiedAt)}` : 'Link not yet verified'}</span>
        </div>
      </div>
      <a className="btn btn-primary btn-sm" href={d.launchUrl} target={newTab ? '_blank' : undefined} rel="noopener noreferrer"
        aria-label={`Open ${d.name} (external site${newTab ? ', opens in a new tab' : ''})`}>
        Open Dashboard <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  );
}

function KV({ items }: { items: [string, React.ReactNode][] }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!shown.length) return <p className="subtle">No details recorded yet.</p>;
  return <dl className="kv">{shown.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export function ProjectDetailPage() {
  const { slug } = useParams();
  const { data, error, loading, reload, setData } = useApi<{ project: ProjectDetail }>(`/projects/${slug}`);
  const activity = useApi<{ activity: Activity[] }>(data?.project.access.manage ? `/activity?projectId=${data.project.id}&limit=8` : null);
  const [lightbox, setLightbox] = useState<MediaInfo | null>(null);
  const p = data?.project;

  useEffect(() => { if (p?.id) void api.post(`/projects/${p.id}/viewed`).catch(() => {}); }, [p?.id]);
  const updateFav = useCallback((_: number, isFavorite: boolean) => setData((d) => d && { project: { ...d.project, isFavorite } }), [setData]);
  const toggleFavorite = useFavoriteToggle(updateFav);

  if (error) {
    return (
      <>
        <Link to="/projects" className="back-link"><ArrowLeft size={15} />Back to Projects</Link>
        {error.status === 404 ? (
          <StateMessage tone="error" icon={<Lock size={28} />} title="Project unavailable" message="This project does not exist or you do not have permission to view it. Contact your administrator if you need access." action={<Link to="/projects" className="btn">Back to Projects</Link>} />
        ) : <ErrorState error={error} onRetry={reload} />}
      </>
    );
  }
  if (loading || !p) {
    return <div className="stack" aria-busy="true"><div className="skeleton" style={{ height: 300, borderRadius: 20 }} /><div className="skeleton" style={{ height: 200, borderRadius: 20 }} /></div>;
  }

  const loc = p.location;
  const images = [p.media.plant && { ...p.media.plant, caption: 'Plant / factory' }, p.media.equipment && { ...p.media.equipment, caption: 'Equipment / machine' }, ...p.media.gallery]
    .filter(Boolean) as MediaInfo[];
  const technicalEntries = p.technical ? Object.entries(p.technical) : [];

  return (
    <>
      <Link to="/projects" className="back-link"><ArrowLeft size={15} />Back to Projects</Link>
      {p.archived && <div className="alert alert-warning" style={{ marginBottom: 16 }}><Info size={18} />This project is archived and hidden from non-administrators.</div>}

      <section className="detail-hero">
        <CoverImage src={p.coverUrl} categorySlug={p.category?.slug} alt="" />
        <div className="detail-hero-content">
          <ClientLogo name={p.client?.name} src={p.client?.logoUrl} size="lg" />
          <div className="detail-hero-text">
            <div className="row" style={{ gap: 6 }}>
              <StatusBadge status={p.status} />
              {p.category && <Link to={`/projects?category=${p.category.slug}`} className="badge badge-accent">{p.category.name}</Link>}
              {p.isDemo && <DemoBadge />}
            </div>
            <span className="pcard-client-name">{p.client ? <Link to={`/clients/${p.client.slug}`} style={{ color: 'inherit' }}>{p.client.name}</Link> : 'Client to be added'}</span>
            <h1>{p.name}</h1>
            {p.shortDescription && <p className="muted" style={{ maxWidth: 720 }}>{p.shortDescription}</p>}
          </div>
          <div className="row">
            <button className="btn" aria-pressed={p.isFavorite} onClick={() => toggleFavorite(p)}>
              <Star size={16} fill={p.isFavorite ? '#E0A43A' : 'none'} color={p.isFavorite ? '#E0A43A' : 'currentColor'} />{p.isFavorite ? 'Favorited' : 'Favorite'}
            </button>
            {p.access.manage && !p.archived && <Link to={`/admin/projects/${p.id}/edit`} className="btn"><Pencil size={16} />Edit</Link>}
          </div>
        </div>
      </section>

      <div className="grid-2">
        <div className="stack">
          <section className="panel" aria-labelledby="dash-h">
            <div className="panel-header"><h2 id="dash-h"><LayoutDashboard size={18} aria-hidden="true" />Dashboards</h2><span className="subtle">{p.dashboards.length} configured</span></div>
            {p.dashboards.length ? (
              <>
                <div className="dash-list">{p.dashboards.map((d) => <DashboardRow key={d.id} d={d} />)}</div>
                <p className="subtle" style={{ marginTop: 12 }}>Dashboards open on their own platforms. Project Atlas does not show live machine data, and a link check only confirms the web address responded.</p>
              </>
            ) : (
              <StateMessage icon={<LayoutDashboard size={26} />} title="No dashboard link configured" message={p.access.manage ? 'Add the dashboard URL when it is supplied.' : 'The dashboard for this project has not been added yet.'}
                action={p.access.manage && !p.archived && <Link to={`/admin/projects/${p.id}/edit#dashboards`} className="btn">Add dashboard</Link>} />
            )}
          </section>

          <section className="panel" aria-labelledby="about-h">
            <div className="panel-header"><h2 id="about-h"><Info size={18} aria-hidden="true" />About this project</h2></div>
            {p.description ? <p style={{ whiteSpace: 'pre-line' }} className="muted">{p.description}</p> : <p className="subtle">No detailed description has been added yet.</p>}
            {p.tags.length > 0 && <div className="tag-list" style={{ marginTop: 14 }}>{p.tags.map((t) => <Link key={t} to={`/projects?q=${encodeURIComponent(t)}`} className="chip">#{t}</Link>)}</div>}
          </section>

          <section className="panel" aria-labelledby="gal-h">
            <div className="panel-header"><h2 id="gal-h"><ImageIcon size={18} aria-hidden="true" />Images</h2></div>
            {images.length ? (
              <div className="gallery">
                {images.map((m) => (
                  <button key={m.id} onClick={() => setLightbox(m)} aria-label={`View image${m.caption ? `: ${m.caption}` : ''}`}>
                    <img src={m.thumbUrl ?? m.url} alt={m.caption ?? ''} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : <p className="subtle">No project images have been uploaded yet. The cover shown above is a placeholder illustration until a real image is added.</p>}
          </section>

          {p.technical ? (
            <section className="panel" aria-labelledby="tech-h">
              <div className="panel-header"><h2 id="tech-h"><Cpu size={18} aria-hidden="true" />Technical details</h2><span className="badge badge-info"><ShieldCheck size={12} />Restricted</span></div>
              <KV items={technicalEntries.map(([k, v]) => [TECHNICAL_LABELS[k] ?? k, k === 'documentationUrl' && /^https:\/\//.test(v) ? <a href={v} target="_blank" rel="noopener noreferrer">{v}</a> : v])} />
            </section>
          ) : (
            <div className="restricted-note"><Lock size={16} aria-hidden="true" />Technical and maintenance details are visible to users with technical access to this project.</div>
          )}
        </div>

        <div className="stack">
          <section className="panel" aria-labelledby="info-h">
            <div className="panel-header"><h2 id="info-h"><Calendar size={18} aria-hidden="true" />Key information</h2></div>
            <KV items={[
              ['Client', p.client?.name ?? 'To be added'],
              ['Industry', p.client?.industry],
              ['Category', p.category?.name],
              ['Project type', p.projectType],
              ['Site / plant', loc?.siteName],
              ['Location', loc ? <span className="row" style={{ gap: 6 }}><MapPin size={14} />{locationText(loc)}</span> : null],
              ['Start date', p.startDate && formatDate(p.startDate)],
              ['Completion date', p.completionDate && formatDate(p.completionDate)],
              ['Last updated', `${formatDateTime(p.updatedAt)}${p.updatedByName ? ` by ${p.updatedByName}` : ''}`],
            ]} />
          </section>

          {p.contact && (p.contact.owner || p.contact.responsibleTeam || p.contact.supportContact) && (
            <section className="panel" aria-labelledby="contact-h">
              <div className="panel-header"><h2 id="contact-h"><User size={18} aria-hidden="true" />Ownership &amp; support</h2></div>
              <KV items={[['Project owner', p.contact.owner?.name], ['Responsible team', p.contact.responsibleTeam], ['Support contact', p.contact.supportContact]]} />
            </section>
          )}

          {p.maintenance && (
            <section className="panel" aria-labelledby="maint-h">
              <div className="panel-header"><h2 id="maint-h"><Wrench size={18} aria-hidden="true" />Maintenance</h2></div>
              <KV items={[
                ['Last maintenance', p.maintenance.lastDate && formatDate(p.maintenance.lastDate)],
                ['Next maintenance', p.maintenance.nextDate && formatDate(p.maintenance.nextDate)],
                ['Review date', p.maintenance.reviewDate && formatDate(p.maintenance.reviewDate)],
                ['Decommission date', p.maintenance.decommissionDate && formatDate(p.maintenance.decommissionDate)],
                ['Notes', p.maintenance.notes],
              ]} />
              <p className="subtle" style={{ marginTop: 10 }}>Lifecycle status describes the project, not the real-time health of its dashboards or equipment.</p>
            </section>
          )}

          <section className="panel" aria-labelledby="docs-h">
            <div className="panel-header"><h2 id="docs-h"><FileText size={18} aria-hidden="true" />Documents</h2></div>
            {p.media.document ? (
              <a className="mini-item" href={p.media.document.url} target="_blank" rel="noopener noreferrer">
                <span className="dash-icon" style={{ width: 40, height: 40 }}><FileText size={18} /></span>
                <span className="mini-body"><strong>{p.media.document.name}</strong><span>PDF ({formatBytes(p.media.document.size)})</span></span>
                <ExternalLink size={15} />
              </a>
            ) : <p className="subtle">No documents attached.</p>}
          </section>

          {p.access.manage && (
            <section className="panel" aria-labelledby="act-h">
              <div className="panel-header"><h2 id="act-h">Project activity</h2></div>
              {activity.loading ? <div className="skeleton" style={{ height: 120 }} /> : <ActivityList items={activity.data?.activity ?? []} />}
            </section>
          )}
        </div>
      </div>

      {lightbox && (
        <Modal title={lightbox.caption || 'Project image'} onClose={() => setLightbox(null)} wide>
          <div className="lightbox"><img src={lightbox.url} alt={lightbox.caption ?? ''} /></div>
        </Modal>
      )}
    </>
  );
}
