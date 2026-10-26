import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, ExternalLink, Factory, Globe, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { useFavoriteToggle } from '../hooks/useFavorite';
import { api, ApiError } from '../lib/api';
import type { Client, ProjectCard as Card } from '../lib/types';
import { ClientLogo } from '../components/Media';
import { ProjectCard } from '../components/ProjectCard';
import { useToast } from '../components/Toast';
import { MediaUpload, type UploadValue } from '../components/Upload';
import { Alert, CardSkeletons, ConfirmDialog, ErrorState, Field, Modal, PageHeader, Spinner, StateMessage, Switch } from '../components/ui';

const EMPTY = { name: '', isPlaceholder: false, industry: '', website: '', location: '', city: '', state: '', country: '', siteName: '', internalRef: '' };

export function ClientFormModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: (c: Client) => void }) {
  const toast = useToast();
  const [form, setForm] = useState(() => (client ? {
    name: client.name, isPlaceholder: client.isPlaceholder, industry: client.industry ?? '', website: client.website ?? '',
    location: client.location ?? '', city: client.city ?? '', state: client.state ?? '', country: client.country ?? '',
    siteName: client.siteName ?? '', internalRef: client.internalRef ?? '',
  } : EMPTY));
  const [logo, setLogo] = useState<UploadValue | null>(client?.logoMediaId ? { id: client.logoMediaId, url: client.logoUrl!, thumbUrl: client.logoUrl } : null);
  const [cover, setCover] = useState<UploadValue | null>(client?.coverMediaId ? { id: client.coverMediaId, url: client.coverUrl!, thumbUrl: client.coverUrl } : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Client name is required.' }); return; }
    setBusy(true); setErrors({}); setError(undefined);
    try {
      const body = { ...form, logoMediaId: logo?.id ?? null, coverMediaId: cover?.id ?? null };
      const res = client ? await api.put<{ client: Client }>(`/clients/${client.id}`, body) : await api.post<{ client: Client }>('/clients', body);
      toast(client ? 'Client updated' : 'Client added');
      onSaved(res.client);
    } catch (err) {
      const ae = err as ApiError;
      setErrors(ae.fields ?? {});
      setError(ae.message);
    } finally { setBusy(false); }
  };

  const text = (k: keyof typeof EMPTY, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label} error={errors[k]} required={k === 'name'} className={props.span ? 'span-2' : ''}>
      {(p) => <input {...p} className="input" value={String(form[k])} onChange={set(k)} {...(props.type ? { type: String(props.type) } : {})} placeholder={props.placeholder as string | undefined} />}
    </Field>
  );

  return (
    <Modal wide title={client ? `Edit ${client.name}` : 'Add client company'} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => submit()} disabled={busy}>{busy && <Spinner />}{client ? 'Save changes' : 'Add client'}</button></>}>
      <form onSubmit={submit} className="stack" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-grid">
          {text('name', 'Client company name', { span: true })}
          <div className="span-2"><Switch checked={form.isPlaceholder} onChange={(v) => setForm((f) => ({ ...f, isPlaceholder: v }))} label="Name not yet confirmed" description="Marks this record as a placeholder until the client identity is supplied." /></div>
          {text('industry', 'Industry')}
          {text('website', 'Website URL', { type: 'url', placeholder: 'https://' })}
          {text('siteName', 'Site or plant name')}
          {text('location', 'Location / address line')}
          {text('city', 'City')}
          {text('state', 'State')}
          {text('country', 'Country')}
          {text('internalRef', 'Internal client reference')}
          <MediaUpload label="Client logo" value={logo} onChange={setLogo} contain aspect="3 / 2" hint="Use the client's official logo file." />
          <MediaUpload label="Client cover image" value={cover} onChange={setCover} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function ClientsPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ clients: Client[] }>('/clients');
  const [editing, setEditing] = useState<Client | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api.del(`/clients/${deleting.id}`); toast('Client deleted'); setDeleting(null); reload(); }
    catch (e) { toast((e as ApiError).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="Directory" title="Clients" description="Industrial companies Janyutech delivers projects for."
        actions={isAdmin && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} />Add client</button>} />
      {error ? <ErrorState error={error} onRetry={reload} />
        : loading ? <CardSkeletons count={3} />
        : !data!.clients.length ? <StateMessage icon={<Building2 size={28} />} title="No clients to show" message="Clients appear here once you have access to at least one of their projects." />
        : (
          <div className="client-grid">
            {data!.clients.map((c) => (
              <article key={c.id} className="client-card">
                <div className="client-card-head">
                  <ClientLogo name={c.name} src={c.logoUrl} size="lg" />
                  <div style={{ minWidth: 0 }}>
                    <h3><Link to={`/clients/${c.slug}`}>{c.name}</Link></h3>
                    <div className="subtle">{c.industry ?? (c.isPlaceholder ? 'Client identity to be confirmed' : 'Industry not specified')}</div>
                  </div>
                </div>
                <div className="row subtle" style={{ gap: 14 }}>
                  <span className="row" style={{ gap: 5 }}><Factory size={14} />{c.projectCount} project{c.projectCount === 1 ? '' : 's'}</span>
                  {(c.city || c.country) && <span className="row" style={{ gap: 5 }}><MapPin size={14} />{[c.city, c.country].filter(Boolean).join(', ')}</span>}
                  {c.isPlaceholder && <span className="badge badge-demo">Placeholder</span>}
                </div>
                {isAdmin && (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => setEditing(c)}><Pencil size={14} />Edit</button>
                    {isSuperAdmin && <button className="btn btn-sm btn-ghost" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}><Trash2 size={14} /></button>}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      {editing && <ClientFormModal client={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {deleting && <ConfirmDialog danger title="Delete client?" confirmLabel="Delete client" busy={busy} onCancel={() => setDeleting(null)} onConfirm={remove}
        message={<>“{deleting.name}” will be removed. Clients that still have projects cannot be deleted.</>} />}
    </>
  );
}

export function ClientDetailPage() {
  const { slug } = useParams();
  const { isAdmin } = useAuth();
  const { data, error, loading, reload, setData } = useApi<{ client: Client; projects: Card[] }>(`/clients/${slug}`);
  const [editing, setEditing] = useState(false);
  const toggle = useFavoriteToggle((id, fav) => setData((d) => d && { ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, isFavorite: fav } : p)) }));

  if (error) return <><Link to="/clients" className="back-link"><ArrowLeft size={15} />Back to Clients</Link><ErrorState error={error} onRetry={reload} /></>;
  if (loading || !data) return <CardSkeletons count={3} />;
  const c = data.client;
  return (
    <>
      <Link to="/clients" className="back-link"><ArrowLeft size={15} />Back to Clients</Link>
      <section className="panel" style={{ marginBottom: 22 }}>
        <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
          <ClientLogo name={c.name} src={c.logoUrl} size="lg" />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="eyebrow">Client company</div>
            <h1>{c.name}</h1>
            <div className="row subtle" style={{ marginTop: 8, gap: 14 }}>
              {c.industry && <span className="row" style={{ gap: 5 }}><Factory size={14} />{c.industry}</span>}
              {(c.city || c.state || c.country) && <span className="row" style={{ gap: 5 }}><MapPin size={14} />{[c.siteName, c.city, c.state, c.country].filter(Boolean).join(', ')}</span>}
              {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="row" style={{ gap: 5 }}><Globe size={14} />Website <ExternalLink size={12} /></a>}
              {c.isPlaceholder && <span className="badge badge-demo">Client identity to be confirmed</span>}
            </div>
          </div>
          {isAdmin && <button className="btn" onClick={() => setEditing(true)}><Pencil size={16} />Edit client</button>}
        </div>
      </section>
      <h2 style={{ marginBottom: 14 }}>Projects ({data.projects.length})</h2>
      {data.projects.length ? <div className="project-grid">{data.projects.map((p) => <ProjectCard key={p.id} project={p} onToggleFavorite={toggle} />)}</div>
        : <StateMessage icon={<Factory size={28} />} title="No projects yet" message="Projects linked to this client will appear here." />}
      {editing && <ClientFormModal client={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </>
  );
}
