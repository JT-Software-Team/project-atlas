import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Eye, FolderKanban, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, ApiError, qs } from '../../lib/api';
import { VISIBILITY_META } from '../../lib/catalog';
import { formatDate } from '../../lib/format';
import type { ProjectCard } from '../../lib/types';
import { ClientLogo } from '../../components/Media';
import { useToast } from '../../components/Toast';
import { ConfirmDialog, DemoBadge, ErrorState, Field, PageHeader, StateMessage, StatusBadge } from '../../components/ui';

export function ProjectAdminPage() {
  const { isSuperAdmin } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('archived') === 'only' ? 'archived' : 'current';
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useApi<{ projects: ProjectCard[] }>(`/projects${qs({ archived: tab === 'archived' ? 'only' : undefined, sort: 'name_asc' })}`);
  const [action, setAction] = useState<{ kind: 'archive' | 'restore' | 'delete'; project: ProjectCard } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const manageable = (data?.projects ?? []).filter((p) => p.access.manage)
    .filter((p) => !q || `${p.name} ${p.client?.name ?? ''} ${p.slug}`.toLowerCase().includes(q.toLowerCase()));

  const run = async () => {
    if (!action) return;
    setBusy(true);
    const { kind, project } = action;
    try {
      if (kind === 'delete') await api.del(`/projects/${project.id}`, { confirm: confirmText });
      else await api.post(`/projects/${project.id}/${kind}`);
      toast(kind === 'archive' ? `Archived “${project.name}”` : kind === 'restore' ? `Restored “${project.name}”` : `Deleted “${project.name}” permanently`);
      setAction(null);
      setConfirmText('');
      reload();
    } catch (e) { toast((e as ApiError).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="Administration" title="Project Management" description="Add, edit, archive and restore the projects you manage."
        actions={isSuperAdmin && <Link to="/admin/projects/new" className="btn btn-primary"><Plus size={16} />Add project</Link>} />
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Project state">
          <button className="tab" role="tab" aria-selected={tab === 'current'} onClick={() => setParams({})}>Current</button>
          <button className="tab" role="tab" aria-selected={tab === 'archived'} onClick={() => setParams({ archived: 'only' })}>Archived</button>
        </div>
        <div className="input-wrap"><Search size={17} aria-hidden="true" /><input className="input" type="search" placeholder="Filter by name, client or ID" aria-label="Filter projects" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} />
        : loading ? <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />
        : !manageable.length ? (
          <StateMessage icon={<FolderKanban size={28} />} title={tab === 'archived' ? 'No archived projects' : 'No projects to manage'}
            message={tab === 'archived' ? 'Archived projects appear here and can be restored at any time.' : isSuperAdmin ? 'Create the first project to get started.' : 'A Super Admin can assign projects for you to manage.'}
            action={isSuperAdmin && tab === 'current' && <Link to="/admin/projects/new" className="btn btn-primary"><Plus size={16} />Add project</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Visibility</th><th>Dashboards</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {manageable.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="row" style={{ gap: 6 }}><span className="subtle mono">{p.slug}</span>{p.isDemo && <DemoBadge compact />}</div>
                    </td>
                    <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><ClientLogo name={p.client?.name} src={p.client?.logoUrl} size="sm" />{p.client?.name ?? <span className="subtle">To be added</span>}</span></td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>{p.visibility ? VISIBILITY_META[p.visibility].label : '—'}</td>
                    <td>{p.dashboardCount || <span className="subtle">None</span>}</td>
                    <td className="muted">{formatDate(p.updatedAt)}</td>
                    <td>
                      <div className="actions">
                        <Link to={`/projects/${p.slug}`} className="btn btn-sm btn-ghost icon-btn" aria-label={`View ${p.name}`} title="View"><Eye size={15} /></Link>
                        {tab === 'current' ? (
                          <>
                            <Link to={`/admin/projects/${p.id}/edit`} className="btn btn-sm icon-btn" aria-label={`Edit ${p.name}`} title="Edit"><Pencil size={15} /></Link>
                            <button className="btn btn-sm icon-btn" onClick={() => setAction({ kind: 'archive', project: p })} aria-label={`Archive ${p.name}`} title="Archive"><Archive size={15} /></button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-sm" onClick={() => setAction({ kind: 'restore', project: p })}><ArchiveRestore size={15} />Restore</button>
                            {isSuperAdmin && <button className="btn btn-sm btn-danger icon-btn" onClick={() => setAction({ kind: 'delete', project: p })} aria-label={`Delete ${p.name} permanently`} title="Delete permanently"><Trash2 size={15} /></button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {action?.kind === 'archive' && (
        <ConfirmDialog title="Archive project?" confirmLabel="Archive" busy={busy} onCancel={() => setAction(null)} onConfirm={run}
          message={<>“{action.project.name}” will be hidden from viewers and its dashboards will not be listed. You can restore it at any time.</>} />
      )}
      {action?.kind === 'restore' && (
        <ConfirmDialog title="Restore project?" confirmLabel="Restore" busy={busy} onCancel={() => setAction(null)} onConfirm={run}
          message={<>“{action.project.name}” will return to the directory with its previous status.</>} />
      )}
      {action?.kind === 'delete' && (
        <ConfirmDialog danger title="Delete permanently?" confirmLabel="Delete forever" busy={busy} disabled={confirmText !== action.project.slug}
          onCancel={() => { setAction(null); setConfirmText(''); }} onConfirm={run}
          message={<>This removes “{action.project.name}”, its dashboards, gallery and access grants. This cannot be undone. Archiving is usually the better choice.</>}>
          <Field label={`Type the project ID “${action.project.slug}” to confirm`}>
            {(p) => <input {...p} className="input mono" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />}
          </Field>
        </ConfirmDialog>
      )}
    </>
  );
}
