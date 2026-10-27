import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, HardDrive, Pencil, Plus, Shapes, Trash2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { api, ApiError, qs } from '../../lib/api';
import { formatBytes, formatDateTime } from '../../lib/format';
import type { Activity, Category } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { Alert, ConfirmDialog, ErrorState, Field, Modal, PageHeader, Spinner } from '../../components/ui';

function CategoriesTab() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<{ categories: Category[] }>('/categories');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const open = (c: Category | 'new') => { setEditing(c); setFormError(undefined); setForm(c === 'new' ? { name: '', description: '' } : { name: c.name, description: c.description ?? '' }); };
  const save = async () => {
    setBusy(true); setFormError(undefined);
    try {
      if (editing === 'new') await api.post('/categories', form); else await api.put(`/categories/${(editing as Category).id}`, form);
      toast(editing === 'new' ? 'Category added' : 'Category updated');
      setEditing(null); reload();
    } catch (e) { setFormError((e as ApiError).message); } finally { setBusy(false); }
  };
  const move = async (i: number, dir: -1 | 1) => {
    const list = [...data!.categories];
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    setData({ categories: list });
    try { await api.put('/categories/order', { ids: list.map((c) => c.id) }); } catch { reload(); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.del(`/categories/${deleting!.id}`); toast('Category deleted'); setDeleting(null); reload(); }
    catch (e) { toast((e as ApiError).message, 'error'); setDeleting(null); } finally { setBusy(false); }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <section className="panel">
      <div className="panel-header"><h2><Shapes size={18} />Project categories</h2><button className="btn btn-sm btn-primary" onClick={() => open('new')}><Plus size={14} />Add category</button></div>
      {loading ? <div className="skeleton" style={{ height: 200 }} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Order</th><th>Name</th><th>Projects</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data!.categories.map((c, i) => (
                <tr key={c.id}>
                  <td><div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${c.name} up`}><ArrowUp size={14} /></button>
                    <button className="btn btn-ghost btn-sm icon-btn" disabled={i === data!.categories.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${c.name} down`}><ArrowDown size={14} /></button>
                  </div></td>
                  <td><strong>{c.name}</strong>{c.description && <div className="subtle">{c.description}</div>}</td>
                  <td>{c.projectCount}</td>
                  <td><div className="actions">
                    <button className="btn btn-sm icon-btn" onClick={() => open(c)} aria-label={`Rename ${c.name}`}><Pencil size={14} /></button>
                    <button className="btn btn-sm btn-ghost icon-btn" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={editing === 'new' ? 'Add category' : 'Edit category'} onClose={() => setEditing(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy || form.name.trim().length < 2}>{busy && <Spinner />}Save</button></>}>
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field label="Name" required>{(p) => <input {...p} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Description">{(p) => <input {...p} className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
        </Modal>
      )}
      {deleting && <ConfirmDialog danger title="Delete category?" confirmLabel="Delete" busy={busy} onCancel={() => setDeleting(null)} onConfirm={remove}
        message={<>“{deleting.name}” will be removed. Categories still used by projects cannot be deleted; move those projects first.</>} />}
    </section>
  );
}

const ACTION_FILTERS = [['', 'All events'], ['project.', 'Projects'], ['dashboard.', 'Dashboards'], ['access.', 'Access grants'], ['user.', 'Users'], ['auth.', 'Sign-ins & passwords'], ['client.', 'Clients'], ['category.', 'Categories']];

function ActivityTab() {
  const [action, setAction] = useState('');
  const { data, error, loading, reload } = useApi<{ activity: Activity[] }>(`/activity${qs({ action, limit: 200 })}`);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Audit log</h2>
        <select className="select" style={{ width: 'auto' }} aria-label="Filter events" value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTION_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <p className="subtle" style={{ marginBottom: 14 }}>Records who changed what and when. Passwords, tokens and dashboard content are never logged.</p>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <div className="skeleton" style={{ height: 240 }} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Event</th><th>IP</th></tr></thead>
            <tbody>
              {data!.activity.map((a) => (
                <tr key={a.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(a.at)}</td>
                  <td>{a.userName ?? 'System'}</td>
                  <td><div>{a.summary}</div><div className="subtle mono">{a.action}</div></td>
                  <td className="subtle mono">{a.ip ?? '—'}</td>
                </tr>
              ))}
              {!data!.activity.length && <tr><td colSpan={4} className="subtle">No events recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface Usage {
  storage: { bytes: number; files: number; limitBytes: number };
  records: { projects: number; clients: number; users: number; media: number; dashboards: number; auditEvents: number };
  database: 'hosted' | 'local';
}

/** Stored file size against the upload limit, so the free hosting quota is never a surprise. */
function UsageTab() {
  const { data, error, loading, reload } = useApi<Usage>('/media/usage');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <div className="skeleton" style={{ height: 180 }} />;
  const { storage, records } = data;
  const pct = Math.min(100, Math.round((storage.bytes / storage.limitBytes) * 100));
  const tone = pct >= 90 ? 'var(--error)' : pct >= 75 ? 'var(--warning)' : 'var(--cyan)';
  return (
    <section className="panel">
      <div className="panel-header"><h2><HardDrive size={18} />Storage &amp; usage</h2></div>
      <p className="muted" style={{ marginBottom: 6 }}>
        Uploaded files: <strong style={{ color: 'var(--text)' }}>{formatBytes(storage.bytes)}</strong> of {formatBytes(storage.limitBytes)} upload limit ({pct}%), {storage.files} stored files.
      </p>
      <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="File storage used"
        style={{ height: 8, borderRadius: 999, background: 'var(--panel-2)', overflow: 'hidden', margin: '10px 0 18px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone, transition: 'width 0.4s var(--ease)' }} />
      </div>
      {pct >= 75 && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="warning">Storage is filling up. Remove unused images, or review the plan limits in docs/OPERATIONS.md before raising the limit.</Alert>
        </div>
      )}
      <div className="stats" style={{ marginBottom: 12 }}>
        {Object.entries({ Projects: records.projects, Clients: records.clients, Users: records.users, 'Files (media records)': records.media, Dashboards: records.dashboards, 'Audit events': records.auditEvents })
          .map(([label, value]) => (
            <div className="stat" key={label}><div className="stat-top">{label}</div><div className="stat-value">{value}</div></div>
          ))}
      </div>
      <p className="subtle">
        Database: {data.database === 'hosted' ? 'hosted (shared by all server instances)' : 'local file'}. Request, bandwidth and row quotas are shown in the Vercel and Turso dashboards.
      </p>
    </section>
  );
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = requested === 'activity' || requested === 'usage' ? requested : 'categories';
  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings" description="Manage reference data and review administrative activity." />
      <div className="tabs" role="tablist" style={{ marginBottom: 18, width: 'fit-content' }}>
        <button className="tab" role="tab" aria-selected={tab === 'categories'} onClick={() => setParams({ tab: 'categories' })}>Categories</button>
        <button className="tab" role="tab" aria-selected={tab === 'activity'} onClick={() => setParams({ tab: 'activity' })}>Activity log</button>
        <button className="tab" role="tab" aria-selected={tab === 'usage'} onClick={() => setParams({ tab: 'usage' })}>Storage &amp; usage</button>
      </div>
      {tab === 'categories' ? <CategoriesTab /> : tab === 'activity' ? <ActivityTab /> : <UsageTab />}
    </>
  );
}
