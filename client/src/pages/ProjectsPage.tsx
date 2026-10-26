import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FolderSearch, History, Plus, Search, Star, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { useFavoriteToggle } from '../hooks/useFavorite';
import { qs } from '../lib/api';
import { STATUS_META } from '../lib/catalog';
import type { Facets, ProjectCard as Card } from '../lib/types';
import { ProjectCard } from '../components/ProjectCard';
import { CardSkeletons, ErrorState, PageHeader, StateMessage } from '../components/ui';

type Mode = 'all' | 'favorites' | 'recent';

const SORTS: { value: string; label: string; modes?: Mode[] }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name_asc', label: 'Alphabetical (A–Z)' },
  { value: 'name_desc', label: 'Project name (Z–A)' },
  { value: 'client', label: 'Client name' },
  { value: 'newest', label: 'Newest projects' },
  { value: 'accessed', label: 'Most recently accessed' },
];

const COPY: Record<Mode, { eyebrow: string; title: string; description: string }> = {
  all: { eyebrow: 'Directory', title: 'All Projects', description: 'Search and filter every project you are authorised to access.' },
  favorites: { eyebrow: 'Shortcuts', title: 'Favorites', description: 'Projects you have starred for quick access.' },
  recent: { eyebrow: 'History', title: 'Recently Accessed', description: 'Projects and dashboards you opened most recently.' },
};

export function ProjectsPage({ mode = 'all' }: { mode?: Mode }) {
  const { isSuperAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const filters = {
    q: params.get('q') ?? '',
    client: params.get('client') ?? '',
    category: params.get('category') ?? '',
    status: params.get('status') ?? '',
    location: params.get('location') ?? '',
    sort: params.get('sort') ?? (mode === 'recent' ? 'accessed' : 'updated'),
  };
  const url = `/projects${qs({ ...filters, favorites: mode === 'favorites' ? 1 : undefined, recent: mode === 'recent' ? 1 : undefined })}`;
  const { data, error, loading, reload, setData } = useApi<{ projects: Card[]; total: number; facets: Facets }>(url);

  // Keep the search box in sync when navigating via the header search.
  useEffect(() => setQ(params.get('q') ?? ''), [params]);
  // Debounced search as you type.
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => update('q', q), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  const updateFavorite = useCallback((id: number, isFavorite: boolean) => {
    setData((d) => d && ({
      ...d,
      projects: mode === 'favorites' && !isFavorite ? d.projects.filter((p) => p.id !== id) : d.projects.map((p) => (p.id === id ? { ...p, isFavorite } : p)),
    }));
  }, [setData, mode]);
  const toggleFavorite = useFavoriteToggle(updateFavorite);

  const active = Object.entries(filters).filter(([k, v]) => v && k !== 'sort');
  const facets = data?.facets;
  const copy = COPY[mode];

  return (
    <>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={isSuperAdmin && mode === 'all' && <Link to="/admin/projects/new" className="btn btn-primary"><Plus size={16} />Add project</Link>}
      />

      <div className="toolbar" role="search" aria-label="Filter projects">
        <div className="input-wrap">
          <Search size={17} aria-hidden="true" />
          <input className="input" type="search" placeholder="Search name, client, description, tags…" aria-label="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" aria-label="Filter by client" value={filters.client} onChange={(e) => update('client', e.target.value)}>
          <option value="">All clients</option>
          {facets?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" aria-label="Filter by category" value={filters.category} onChange={(e) => update('category', e.target.value)}>
          <option value="">All categories</option>
          {facets?.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select className="select" aria-label="Filter by status" value={filters.status} onChange={(e) => update('status', e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).filter(([s]) => s !== 'archived').map(([s, m]) => <option key={s} value={s}>{m.label}</option>)}
        </select>
        {!!facets?.locations.length && (
          <select className="select" aria-label="Filter by location" value={filters.location} onChange={(e) => update('location', e.target.value)}>
            <option value="">All locations</option>
            {facets.locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <select className="select" aria-label="Sort projects" value={filters.sort} onChange={(e) => update('sort', e.target.value)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="toolbar-foot">
        <span aria-live="polite">{loading ? 'Loading…' : `${data?.total ?? 0} project${data?.total === 1 ? '' : 's'}`}</span>
        {active.length > 0 && (
          <div className="row" style={{ gap: 6 }}>
            {active.map(([k, v]) => (
              <span key={k} className="chip">
                {k === 'client' ? facets?.clients.find((c) => String(c.id) === v)?.name ?? 'Client'
                  : k === 'category' ? facets?.categories.find((c) => c.slug === v)?.name ?? v
                  : k === 'status' ? STATUS_META[v as keyof typeof STATUS_META]?.label ?? v
                  : k === 'q' ? `“${v}”` : v}
                <button aria-label={`Remove filter ${k}`} onClick={() => { update(k, ''); if (k === 'q') setQ(''); }}><X size={13} /></button>
              </span>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => { setParams({}, { replace: true }); setQ(''); }}>Clear all</button>
          </div>
        )}
      </div>

      {error ? <ErrorState error={error} onRetry={reload} />
        : loading && !data ? <CardSkeletons />
        : data!.projects.length === 0 ? (
          mode === 'favorites' && !active.length ? (
            <StateMessage icon={<Star size={28} />} title="No favorites yet" message="Star a project from its card or details page and it will appear here." action={<Link to="/projects" className="btn">Browse projects</Link>} />
          ) : mode === 'recent' && !active.length ? (
            <StateMessage icon={<History size={28} />} title="Nothing opened yet" message="Projects you view and dashboards you open will be listed here." action={<Link to="/projects" className="btn">Browse projects</Link>} />
          ) : (
            <StateMessage icon={<FolderSearch size={28} />} title={active.length ? 'No matching projects' : 'No projects available'}
              message={active.length ? 'Try a different search term or clear some filters.' : 'No projects have been shared with your account yet.'}
              action={active.length > 0 && <button className="btn" onClick={() => { setParams({}, { replace: true }); setQ(''); }}>Clear filters</button>} />
          )
        ) : (
          <div className="project-grid" aria-busy={loading}>
            {data!.projects.map((p) => <ProjectCard key={p.id} project={p} onToggleFavorite={toggleFavorite} />)}
          </div>
        )}
    </>
  );
}
