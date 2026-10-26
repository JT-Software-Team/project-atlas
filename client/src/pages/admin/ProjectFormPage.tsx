import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, ExternalLink, LayoutDashboard, Plus, RefreshCw, Save, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import {
  ACCESS_LABELS, DASHBOARD_TYPES, EDITABLE_STATUSES, ROLE_LABELS, STATUS_META, TECHNICAL_FIELDS, VISIBILITY_META,
} from '../../lib/catalog';
import { formatDateTime, initials, timeAgo } from '../../lib/format';
import type { AccessLevel, Category, Client, ProjectCard as Card, ProjectDetail, ProjectStatus, Role, Visibility } from '../../lib/types';
import { ProjectCard } from '../../components/ProjectCard';
import { useToast } from '../../components/Toast';
import { MediaUpload, type UploadValue } from '../../components/Upload';
import { Alert, ErrorState, Field, Spinner, Switch } from '../../components/ui';
import { ClientFormModal } from '../ClientsPage';

interface DashboardDraft {
  key: string; id?: number; name: string; url: string; type: string; description: string; isPrimary: boolean;
  openIn: 'new_tab' | 'same_tab'; thumbnail: UploadValue | null; provider: string; requiresSeparateLogin: boolean;
  lastVerifiedAt?: string | null; checkResult?: string | null; checkDetail?: string | null;
}
interface UserOption { id: number; name: string; email: string; role: Role }
interface Grant { userId: number; level: AccessLevel }

const PROJECT_TYPES = ['Automation system', 'Monitoring system', 'Retrofit', 'Turnkey installation', 'Upgrade', 'Pilot', 'Service & support'];
const SECTIONS = [
  ['a', 'basic', 'Basic information'], ['b', 'client', 'Client company'], ['c', 'media', 'Images & media'],
  ['d', 'dashboards', 'Dashboards'], ['e', 'technical', 'Technical details'], ['f', 'access', 'Ownership & access'],
  ['g', 'lifecycle', 'Maintenance & lifecycle'],
] as const;

const slugify = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const newKey = () => Math.random().toString(36).slice(2);
const httpsProblem = (url: string) => {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:') return 'Dashboard links must use https://';
    if (u.username || u.password) return 'Do not include usernames or passwords in the link.';
    return null;
  } catch { return 'Enter a full URL, starting with https://'; }
};

const emptyForm = {
  name: '', slug: '', shortDescription: '', description: '', categoryId: '' as string | number, projectType: '',
  status: 'planning' as ProjectStatus, startDate: '', completionDate: '', tags: [] as string[], featured: false, isDemo: false,
  clientId: '' as string | number, siteName: '', city: '', state: '', country: '', locationApproved: false,
  ownerUserId: '' as string | number, responsibleTeam: '', authorizedRoles: [] as Role[], clientAccess: false,
  visibility: 'restricted' as Visibility, confirmPublic: false, internalNotes: '', approvalStatus: 'draft' as 'draft' | 'pending_review' | 'approved',
  contactApproved: false, maintenanceNotes: '', lastMaintenanceDate: '', nextMaintenanceDate: '', supportContact: '',
  reviewDate: '', decommissionDate: '',
};
type Form = typeof emptyForm;

export function ProjectFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const { isSuperAdmin } = useAuth();

  const project = useApi<{ project: ProjectDetail }>(id ? `/projects/${id}` : null);
  const categories = useApi<{ categories: Category[] }>('/categories');
  const clients = useApi<{ clients: Client[] }>('/clients');
  const users = useApi<{ users: UserOption[] }>('/users/options');
  const grantsApi = useApi<{ grants: (Grant & { name: string })[] }>(id ? `/projects/${id}/access` : null);

  const [form, setForm] = useState<Form>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [media, setMedia] = useState<Record<'cover' | 'plant' | 'equipment' | 'document', UploadValue | null>>({ cover: null, plant: null, equipment: null, document: null });
  const [gallery, setGallery] = useState<(UploadValue & { caption: string })[]>([]);
  const [dashboards, setDashboards] = useState<DashboardDraft[]>([]);
  const [technical, setTechnical] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<{ key: string; label: string; value: string }[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [grantUser, setGrantUser] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [clientModal, setClientModal] = useState(false);
  const [verifying, setVerifying] = useState<number | null>(null);
  const loaded = useRef(false);

  // Populate from an existing project once.
  useEffect(() => {
    const p = project.data?.project;
    if (!p || loaded.current) return;
    loaded.current = true;
    const a = p.admin!;
    setForm({
      name: p.name, slug: p.slug, shortDescription: p.shortDescription ?? '', description: p.description ?? '',
      categoryId: p.category?.id ?? '', projectType: p.projectType ?? '', status: p.status === 'archived' ? 'on_hold' : p.status,
      startDate: p.startDate ?? '', completionDate: p.completionDate ?? '', tags: p.tags, featured: p.featured, isDemo: p.isDemo,
      clientId: p.client?.id ?? '', siteName: a.siteName ?? '', city: a.city ?? '', state: a.state ?? '', country: a.country ?? '',
      locationApproved: a.locationApproved, ownerUserId: a.ownerUserId ?? '', responsibleTeam: p.contact?.responsibleTeam ?? '',
      authorizedRoles: a.authorizedRoles, clientAccess: a.clientAccess, visibility: a.visibility, confirmPublic: false,
      internalNotes: a.internalNotes ?? '', approvalStatus: a.approvalStatus, contactApproved: a.contactApproved,
      maintenanceNotes: p.maintenance?.notes ?? '', lastMaintenanceDate: p.maintenance?.lastDate ?? '',
      nextMaintenanceDate: p.maintenance?.nextDate ?? '', supportContact: p.contact?.supportContact ?? '',
      reviewDate: p.maintenance?.reviewDate ?? '', decommissionDate: p.maintenance?.decommissionDate ?? '',
    });
    setSlugTouched(true);
    const mv = (m: typeof p.media.cover) => (m ? { id: m.id, url: m.url, thumbUrl: m.thumbUrl, name: m.name, size: m.size } : null);
    setMedia({ cover: mv(p.media.cover), plant: mv(p.media.plant), equipment: mv(p.media.equipment), document: mv(p.media.document) });
    setGallery(p.media.gallery.map((g) => ({ id: g.id, url: g.url, thumbUrl: g.thumbUrl, caption: g.caption ?? '' })));
    setDashboards(p.dashboards.map((d) => ({
      key: newKey(), id: d.id, name: d.name, url: d.url ?? '', type: d.type, description: d.description ?? '', isPrimary: d.isPrimary,
      openIn: d.openIn, provider: d.provider ?? '', requiresSeparateLogin: d.requiresSeparateLogin,
      thumbnail: d.thumbnailMediaId ? { id: d.thumbnailMediaId, url: d.thumbnailUrl!, thumbUrl: d.thumbnailUrl } : null,
      lastVerifiedAt: d.lastVerifiedAt, checkResult: d.checkResult, checkDetail: d.checkDetail,
    })));
    const known = new Set(TECHNICAL_FIELDS.map((f) => f.key));
    const tech = p.technical ?? {};
    setTechnical(Object.fromEntries(Object.entries(tech).filter(([k]) => known.has(k))));
    setCustom(Object.entries(tech).filter(([k]) => !known.has(k)).map(([label, value]) => ({ key: newKey(), label, value })));
  }, [project.data]);

  useEffect(() => { if (grantsApi.data) setGrants(grantsApi.data.grants.map((g) => ({ userId: g.userId, level: g.level as AccessLevel }))); }, [grantsApi.data]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const input = (k: keyof Form) => ({
    value: String(form[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });

  const clientList = clients.data?.clients ?? [];
  const categoryList = categories.data?.categories ?? [];
  const userList = users.data?.users ?? [];
  const selectedClient = clientList.find((c) => String(c.id) === String(form.clientId));
  const selectedCategory = categoryList.find((c) => String(c.id) === String(form.categoryId));
  const wasPublic = project.data?.project.admin?.visibility === 'public_overview';

  const preview: Card = useMemo(() => {
    const primary = dashboards.find((d) => d.isPrimary) ?? dashboards[0];
    return {
      id: 0, slug: form.slug, name: form.name || 'Untitled project', shortDescription: form.shortDescription || null,
      category: selectedCategory ? { id: selectedCategory.id, name: selectedCategory.name, slug: selectedCategory.slug } : null,
      projectType: form.projectType, status: form.status, featured: form.featured, isDemo: form.isDemo, tags: form.tags,
      client: selectedClient ? { id: selectedClient.id, name: selectedClient.name, slug: selectedClient.slug, isPlaceholder: selectedClient.isPlaceholder, logoUrl: selectedClient.logoUrl } : null,
      location: form.locationApproved && (form.city || form.state || form.country) ? { siteName: form.siteName, city: form.city, state: form.state, country: form.country } : null,
      coverUrl: media.cover?.thumbUrl ?? media.cover?.url ?? null, dashboardCount: dashboards.length,
      primaryDashboard: primary ? { id: 0, openIn: primary.openIn, launchUrl: '#' } : null, isFavorite: false, lastAccessedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archived: false, access: { technical: true, manage: true },
    };
  }, [form, dashboards, media.cover, selectedClient, selectedCategory]);

  const updateDash = (key: string, patch: Partial<DashboardDraft>) => {
    setDashboards((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : patch.isPrimary ? { ...d, isPrimary: false } : d)));
    setDirty(true);
  };
  const moveDash = (i: number, dir: -1 | 1) => setDashboards((ds) => {
    const next = [...ds];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    return next;
  });

  const verify = async (d: DashboardDraft) => {
    if (!d.id) return;
    setVerifying(d.id);
    try {
      const res = await api.post<{ check: { result: string; detail: string }; verifiedAt: string }>(`/dashboards/${d.id}/verify`);
      updateDash(d.key, { lastVerifiedAt: res.verifiedAt, checkResult: res.check.result, checkDetail: res.check.detail });
      toast(res.check.detail, res.check.result === 'responded' ? 'success' : 'info');
    } catch (e) { toast((e as ApiError).message, 'error'); } finally { setVerifying(null); }
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t]);
    setTagInput('');
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Project name is required.';
    if (form.startDate && form.completionDate && form.completionDate < form.startDate) e.completionDate = 'Completion date cannot be before the start date.';
    dashboards.forEach((d, i) => {
      if (!d.name.trim()) e[`dashboards.${i}.name`] = 'Dashboard name is required.';
      const p = httpsProblem(d.url);
      if (p) e[`dashboards.${i}.url`] = p;
    });
    if (form.visibility === 'public_overview' && !wasPublic && !form.confirmPublic) e.confirmPublic = 'Confirm the client has authorised a public overview.';
    const docUrl = technical.documentationUrl?.trim();
    if (docUrl && !/^https:\/\//i.test(docUrl)) e['technical.documentationUrl'] = 'Use an https:// link.';
    return e;
  };

  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(undefined);
    if (Object.keys(e).length) {
      setFormError('Please fix the highlighted fields.');
      document.getElementById(`f-${Object.keys(e)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const techPayload: Record<string, string> = { ...technical };
    for (const c of custom) if (c.label.trim() && c.value.trim()) techPayload[c.label.trim()] = c.value;
    const body = {
      ...form,
      categoryId: form.categoryId || null, clientId: form.clientId || null, ownerUserId: form.ownerUserId || null,
      coverMediaId: media.cover?.id ?? null, plantMediaId: media.plant?.id ?? null, equipmentMediaId: media.equipment?.id ?? null,
      documentMediaId: media.document?.id ?? null,
      gallery: gallery.map((g) => ({ mediaId: g.id, caption: g.caption })),
      technical: techPayload,
      dashboards: dashboards.map((d) => ({
        id: d.id, name: d.name, url: d.url.trim(), type: d.type, description: d.description, isPrimary: d.isPrimary, openIn: d.openIn,
        thumbnailMediaId: d.thumbnail?.id ?? null, provider: d.provider, requiresSeparateLogin: d.requiresSeparateLogin,
      })),
    };
    setSaving(true);
    try {
      const res = isNew
        ? await api.post<{ project: ProjectDetail }>('/projects', body)
        : await api.put<{ project: ProjectDetail }>(`/projects/${id}`, body);
      const changedGrants = JSON.stringify(grants) !== JSON.stringify(grantsApi.data?.grants.map((g) => ({ userId: g.userId, level: g.level })) ?? []);
      if (changedGrants) await api.put(`/projects/${res.project.id}/access`, { grants });
      setDirty(false);
      toast(isNew ? 'Project created' : 'Project saved');
      navigate(`/projects/${res.project.slug}`);
    } catch (err) {
      const ae = err as ApiError;
      setErrors(ae.fields ?? {});
      setFormError(ae.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setSaving(false); }
  };

  if (project.error) return <ErrorState error={project.error} onRetry={project.reload} />;
  if (!isNew && !project.data) return <div className="skeleton" style={{ height: 400, borderRadius: 20 }} />;
  if (project.data?.project.archived) {
    return <Alert tone="warning">This project is archived. Restore it from <Link to="/admin/projects?archived=only">Project Management</Link> before editing.</Alert>;
  }

  const err = (k: string) => errors[k];
  const sectionHasError = (s: string) => Object.keys(errors).some((k) =>
    (s === 'basic' && ['name', 'slug', 'completionDate', 'categoryId'].includes(k)) || (s === 'dashboards' && k.startsWith('dashboards'))
    || (s === 'client' && k === 'clientId') || (s === 'access' && ['visibility', 'confirmPublic', 'ownerUserId'].includes(k)) || (s === 'technical' && k.startsWith('technical')));
  const grantable = userList.filter((u) => u.role !== 'super_admin' && !grants.some((g) => g.userId === u.id));

  return (
    <form onSubmit={submit} noValidate>
      <Link to={isNew ? '/admin/projects' : `/projects/${project.data!.project.slug}`} className="back-link"><ArrowLeft size={15} />{isNew ? 'Back to Project Management' : 'Back to project'}</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">Project management</div>
          <h1>{isNew ? 'Add new project' : `Edit ${project.data!.project.name}`}</h1>
          {!isNew && <p>Last updated {formatDateTime(project.data!.project.updatedAt)}{project.data!.project.updatedByName ? ` by ${project.data!.project.updatedByName}` : ''}</p>}
        </div>
      </div>
      {formError && <div style={{ marginBottom: 16 }}><Alert tone="error">{formError}</Alert></div>}

      <div className="form-layout">
        <nav className="form-nav" aria-label="Form sections">
          {SECTIONS.map(([letter, idName, label]) => (
            <a key={idName} href={`#${idName}`} className={sectionHasError(idName) ? 'has-error' : ''}><span className="letter">{letter.toUpperCase()}</span>{label}</a>
          ))}
        </nav>

        <div className="stack">
          {/* A — Basic */}
          <section id="basic" className="panel form-section">
            <div className="panel-header"><h2><span className="letter">A</span>Basic project information</h2></div>
            <div className="form-grid">
              <Field label="Project display name" required error={err('name')} className="span-2">
                {(p) => <input {...p} id="f-name" className="input" value={form.name} onChange={(e) => { set('name', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} placeholder="e.g. Gunny Ball Project" />}
              </Field>
              <Field label="Project ID (URL slug)" hint="Generated from the name. Must be unique." error={err('slug')}>
                {(p) => <input {...p} className="input mono" value={form.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} />}
              </Field>
              <Field label="Last updated" hint="Set automatically when you save.">
                {(p) => <input {...p} className="input" disabled value={isNew ? 'On first save' : formatDateTime(project.data!.project.updatedAt)} />}
              </Field>
              <Field label="Short description" hint={`Shown on project cards. ${form.shortDescription.length}/280`} className="span-2">
                {(p) => <textarea {...p} className="textarea" style={{ minHeight: 70 }} maxLength={280} {...input('shortDescription')} />}
              </Field>
              <Field label="Detailed description" className="span-2">
                {(p) => <textarea {...p} className="textarea" style={{ minHeight: 140 }} {...input('description')} />}
              </Field>
              <Field label="Category" error={err('categoryId')} hint={isSuperAdmin ? <>Manage categories in <Link to="/admin/settings?tab=categories">Settings</Link>.</> : undefined}>
                {(p) => <select {...p} className="select" {...input('categoryId')}><option value="">Select a category</option>{categoryList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
              </Field>
              <Field label="Project type">
                {(p) => <><input {...p} className="input" list="project-types" {...input('projectType')} /><datalist id="project-types">{PROJECT_TYPES.map((t) => <option key={t} value={t} />)}</datalist></>}
              </Field>
              <Field label="Project status" hint="Lifecycle status — not the live health of any dashboard.">
                {(p) => <select {...p} className="select" {...input('status')}>{EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select>}
              </Field>
              <div />
              <Field label="Start date">{(p) => <input {...p} type="date" className="input" {...input('startDate')} />}</Field>
              <Field label="Completion date" error={err('completionDate')}>{(p) => <input {...p} id="f-completionDate" type="date" className="input" {...input('completionDate')} />}</Field>
              <Field label="Tags / keywords" hint="Press Enter to add a tag." className="span-2">
                {(p) => (
                  <div className="stack" style={{ gap: 8 }}>
                    <input {...p} className="input" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} onBlur={addTag} placeholder="automation, conveyor…" />
                    {form.tags.length > 0 && <div className="tag-list">{form.tags.map((t) => <span key={t} className="chip">#{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => set('tags', form.tags.filter((x) => x !== t))}><X size={12} /></button></span>)}</div>}
                  </div>
                )}
              </Field>
              <Switch checked={form.featured} onChange={(v) => set('featured', v)} label="Featured project" description="Highlighted on the overview." />
              {isSuperAdmin && <Switch checked={form.isDemo} onChange={(v) => set('isDemo', v)} label="Demo data" description="Labels this record as sample content. Turn off once real details are entered." />}
            </div>
          </section>

          {/* B — Client */}
          <section id="client" className="panel form-section">
            <div className="panel-header"><h2><span className="letter">B</span>Client company</h2></div>
            <p className="section-desc">One client can own many projects. Pick an existing client to avoid duplicates, or add a new one.</p>
            <div className="form-grid">
              <Field label="Client company" error={err('clientId')} hint={selectedClient?.isPlaceholder ? 'This client is a placeholder until the real name is confirmed.' : 'Leave empty if the client is not yet known.'}>
                {(p) => <select {...p} className="select" {...input('clientId')}><option value="">Client to be added</option>{clientList.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isPlaceholder ? ' (placeholder)' : ''}</option>)}</select>}
              </Field>
              <div className="field"><span className="field-label">&nbsp;</span><button type="button" className="btn" onClick={() => setClientModal(true)}><Plus size={16} />New client company</button></div>
              {selectedClient && (
                <div className="span-2 subtle">Client logo, industry and website are managed on the client record. <Link to={`/clients/${selectedClient.slug}`} target="_blank">Open client <ExternalLink size={12} /></Link></div>
              )}
              <Field label="Site or plant name">{(p) => <input {...p} className="input" {...input('siteName')} />}</Field>
              <Field label="City">{(p) => <input {...p} className="input" {...input('city')} />}</Field>
              <Field label="State">{(p) => <input {...p} className="input" {...input('state')} />}</Field>
              <Field label="Country">{(p) => <input {...p} className="input" {...input('country')} />}</Field>
              <div className="span-2"><Switch checked={form.locationApproved} onChange={(v) => set('locationApproved', v)} label="Location approved for display" description="When off, site and location are only shown to users with technical access." /></div>
            </div>
          </section>

          {/* C — Media */}
          <section id="media" className="panel form-section">
            <div className="panel-header"><h2><span className="letter">C</span>Project images &amp; media</h2></div>
            <p className="section-desc">Images are checked, re-encoded and resized on upload. A category illustration is shown when no cover exists.</p>
            <div className="form-grid">
              <MediaUpload label="Main project cover image" value={media.cover} onChange={(v) => { setMedia((m) => ({ ...m, cover: v })); setDirty(true); }} />
              <MediaUpload label="Industrial plant / factory image" value={media.plant} onChange={(v) => { setMedia((m) => ({ ...m, plant: v })); setDirty(true); }} />
              <MediaUpload label="Equipment / machine image" value={media.equipment} onChange={(v) => { setMedia((m) => ({ ...m, equipment: v })); setDirty(true); }} />
              <MediaUpload label="Project document (PDF)" kind="document" value={media.document} onChange={(v) => { setMedia((m) => ({ ...m, document: v })); setDirty(true); }} />
              <div className="span-2 stack" style={{ gap: 10 }}>
                <span className="field-label">Project image gallery</span>
                {gallery.length > 0 && (
                  <div className="gallery-edit">
                    {gallery.map((g, i) => (
                      <div key={g.id} className="gallery-edit-item">
                        <img src={g.thumbUrl ?? g.url} alt={g.caption || `Gallery image ${i + 1}`} />
                        <input className="input" placeholder="Caption" aria-label={`Caption for image ${i + 1}`} value={g.caption} onChange={(e) => { setGallery((gs) => gs.map((x) => (x.id === g.id ? { ...x, caption: e.target.value } : x))); setDirty(true); }} />
                        <button type="button" className="btn btn-sm icon-btn" aria-label={`Remove image ${i + 1}`} onClick={() => { setGallery((gs) => gs.filter((x) => x.id !== g.id)); setDirty(true); }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ maxWidth: 320 }}>
                  <MediaUpload label="Add gallery image" value={null} onChange={(v) => { if (v) { setGallery((gs) => [...gs, { ...v, caption: '' }]); setDirty(true); } }} aspect="3 / 1" />
                </div>
              </div>
            </div>
          </section>

          {/* D — Dashboards */}
          <section id="dashboards" className="panel form-section">
            <div className="panel-header">
              <h2><span className="letter">D</span>Dashboard information</h2>
              <button type="button" className="btn btn-sm" onClick={() => { setDashboards((ds) => [...ds, { key: newKey(), name: '', url: '', type: 'live_monitoring', description: '', isPrimary: ds.length === 0, openIn: 'new_tab', thumbnail: null, provider: '', requiresSeparateLogin: true }]); setDirty(true); }}><Plus size={14} />Add dashboard</button>
            </div>
            <p className="section-desc">Links open the external dashboard directly. Do not include passwords or tokens in links; users sign in to the dashboard platform separately.</p>
            {dashboards.length === 0 ? (
              <div className="restricted-note"><LayoutDashboard size={16} />No dashboard links yet. Add one when the URL is supplied; cards will show “No dashboard link configured” until then.</div>
            ) : (
              <div className="dash-editor">
                {dashboards.map((d, i) => (
                  <div key={d.key} className={`dash-edit-card ${d.isPrimary ? 'primary' : ''}`}>
                    <div className="dash-edit-head">
                      <strong><LayoutDashboard size={16} />Dashboard {i + 1}{d.isPrimary && <span className="badge badge-info">Primary</span>}</strong>
                      <div className="row" style={{ gap: 4 }}>
                        <button type="button" className="btn btn-ghost btn-sm icon-btn" disabled={i === 0} onClick={() => moveDash(i, -1)} aria-label="Move up"><ArrowUp size={15} /></button>
                        <button type="button" className="btn btn-ghost btn-sm icon-btn" disabled={i === dashboards.length - 1} onClick={() => moveDash(i, 1)} aria-label="Move down"><ArrowDown size={15} /></button>
                        <button type="button" className="btn btn-ghost btn-sm icon-btn" onClick={() => { setDashboards((ds) => ds.filter((x) => x.key !== d.key)); setDirty(true); }} aria-label={`Remove dashboard ${i + 1}`}><Trash2 size={15} /></button>
                      </div>
                    </div>
                    <div className="form-grid">
                      <Field label="Display name" required error={err(`dashboards.${i}.name`)}>{(p) => <input {...p} id={`f-dashboards.${i}.name`} className="input" value={d.name} onChange={(e) => updateDash(d.key, { name: e.target.value })} />}</Field>
                      <Field label="Dashboard URL" required error={err(`dashboards.${i}.url`)}>{(p) => <input {...p} id={`f-dashboards.${i}.url`} className="input mono" type="url" placeholder="https://" value={d.url} onChange={(e) => updateDash(d.key, { url: e.target.value })} />}</Field>
                      <Field label="Dashboard type">{(p) => <select {...p} className="select" value={d.type} onChange={(e) => updateDash(d.key, { type: e.target.value })}>{Object.entries(DASHBOARD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
                      <Field label="Provider / platform" hint="e.g. Grafana, Power BI, SCADA web portal">{(p) => <input {...p} className="input" value={d.provider} onChange={(e) => updateDash(d.key, { provider: e.target.value })} />}</Field>
                      <Field label="Short description" className="span-2">{(p) => <input {...p} className="input" value={d.description} onChange={(e) => updateDash(d.key, { description: e.target.value })} />}</Field>
                      <Field label="Open in">{(p) => <select {...p} className="select" value={d.openIn} onChange={(e) => updateDash(d.key, { openIn: e.target.value as 'new_tab' | 'same_tab' })}><option value="new_tab">New tab</option><option value="same_tab">Same tab</option></select>}</Field>
                      <div className="stack" style={{ gap: 0 }}>
                        <Switch checked={d.isPrimary} onChange={(v) => v && updateDash(d.key, { isPrimary: true })} label="Primary dashboard" description="Used by the card's Open Dashboard button." />
                        <Switch checked={d.requiresSeparateLogin} onChange={(v) => updateDash(d.key, { requiresSeparateLogin: v })} label="Requires separate sign-in" />
                      </div>
                      <div style={{ maxWidth: 260 }}><MediaUpload label="Thumbnail (optional)" value={d.thumbnail} onChange={(v) => updateDash(d.key, { thumbnail: v })} /></div>
                      <div className="field">
                        <span className="field-label">Link verification</span>
                        {d.id ? (
                          <>
                            <div className="subtle">{d.lastVerifiedAt ? `Checked ${timeAgo(d.lastVerifiedAt)}: ${d.checkDetail}` : 'Not verified yet.'}</div>
                            <div><button type="button" className="btn btn-sm" onClick={() => verify(d)} disabled={verifying === d.id}>{verifying === d.id ? <Spinner /> : <RefreshCw size={14} />}Verify link</button></div>
                            <span className="field-hint">Checks only that the web address responds. It does not log in, read data, or indicate machine status.</span>
                          </>
                        ) : <span className="subtle">Save the project first, then verify the link.</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* E — Technical */}
          <section id="technical" className="panel form-section">
            <div className="panel-header"><h2><span className="letter">E</span>Technical project details</h2><span className="badge badge-info"><ShieldCheck size={12} />Technical access only</span></div>
            <Alert tone="warning">Never enter IP addresses, network topology, credentials or internal endpoints here.</Alert>
            <div className="form-grid" style={{ marginTop: 16 }}>
              {TECHNICAL_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint} error={err(`technical.${f.key}`)} className={f.multiline ? 'span-2' : ''}>
                  {(p) => f.multiline
                    ? <textarea {...p} className="textarea" value={technical[f.key] ?? ''} onChange={(e) => { setTechnical((t) => ({ ...t, [f.key]: e.target.value })); setDirty(true); }} />
                    : <input {...p} id={`f-technical.${f.key}`} className="input" value={technical[f.key] ?? ''} onChange={(e) => { setTechnical((t) => ({ ...t, [f.key]: e.target.value })); setDirty(true); }} />}
                </Field>
              ))}
              <div className="span-2 stack" style={{ gap: 8 }}>
                <span className="field-label">Additional fields</span>
                {custom.map((c) => (
                  <div key={c.key} className="kv-edit">
                    <input className="input" placeholder="Field name" aria-label="Custom field name" value={c.label} onChange={(e) => setCustom((cs) => cs.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)))} />
                    <input className="input" placeholder="Value" aria-label="Custom field value" value={c.value} onChange={(e) => setCustom((cs) => cs.map((x) => (x.key === c.key ? { ...x, value: e.target.value } : x)))} />
                    <button type="button" className="btn btn-ghost icon-btn" aria-label="Remove field" onClick={() => setCustom((cs) => cs.filter((x) => x.key !== c.key))}><Trash2 size={15} /></button>
                  </div>
                ))}
                <div><button type="button" className="btn btn-sm" onClick={() => setCustom((cs) => [...cs, { key: newKey(), label: '', value: '' }])}><Plus size={14} />Add field</button></div>
              </div>
            </div>
          </section>

          {/* F — Ownership & access */}
          <section id="access" className="panel form-section">
            <div className="panel-header"><h2><span className="letter">F</span>Project ownership &amp; access</h2></div>
            <div className="form-grid">
              <Field label="Internal project owner" hint={isSuperAdmin ? 'A Project Admin owner can manage this project.' : 'Only a Super Admin can change the owner.'}>
                {(p) => <select {...p} className="select" disabled={!isSuperAdmin} {...input('ownerUserId')}><option value="">Not assigned</option>{userList.filter((u) => u.role !== 'viewer').map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role]})</option>)}</select>}
              </Field>
              <Field label="Responsible team">{(p) => <input {...p} className="input" {...input('responsibleTeam')} />}</Field>
              <fieldset className="span-2" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-label" style={{ marginBottom: 8 }}>Project visibility</legend>
                <div className="form-grid form-grid-3">
                  {(Object.keys(VISIBILITY_META) as Visibility[]).map((v) => (
                    <label key={v} className="card" style={{ padding: 14, cursor: 'pointer', borderColor: form.visibility === v ? 'var(--accent)' : undefined, opacity: v === 'public_overview' && !isSuperAdmin && !wasPublic ? 0.5 : 1 }}>
                      <span className="row" style={{ gap: 8 }}><input type="radio" name="visibility" checked={form.visibility === v} disabled={v === 'public_overview' && !isSuperAdmin && !wasPublic} onChange={() => set('visibility', v)} /><strong>{VISIBILITY_META[v].label}</strong></span>
                      <span className="subtle" style={{ display: 'block', marginTop: 6 }}>{VISIBILITY_META[v].description}</span>
                    </label>
                  ))}
                </div>
                {form.visibility === 'public_overview' && !wasPublic && (
                  <div className="stack" style={{ gap: 6, marginTop: 12 }} id="f-confirmPublic">
                    <label className="check"><input type="checkbox" checked={form.confirmPublic} onChange={(e) => set('confirmPublic', e.target.checked)} />I confirm the client has explicitly authorised a public overview of this project.</label>
                    {err('confirmPublic') && <span className="field-error">{err('confirmPublic')}</span>}
                    <span className="field-hint">Only the name, summary, category, status, client name and approved location are published, and only once Approval status is “Approved”.</span>
                  </div>
                )}
              </fieldset>
              <fieldset className="span-2" style={{ border: 0, padding: 0, margin: 0 }} disabled={form.visibility === 'private'}>
                <legend className="field-label" style={{ marginBottom: 4 }}>Authorized roles {form.visibility === 'private' && <span className="subtle">(not used for private projects)</span>}</legend>
                <div className="row" style={{ gap: 18 }}>
                  {(['project_admin', 'viewer'] as Role[]).map((r) => (
                    <label key={r} className="check"><input type="checkbox" checked={form.authorizedRoles.includes(r)} onChange={(e) => set('authorizedRoles', e.target.checked ? [...form.authorizedRoles, r] : form.authorizedRoles.filter((x) => x !== r))} />All {ROLE_LABELS[r]}s</label>
                  ))}
                </div>
                <Switch checked={form.clientAccess} onChange={(v) => set('clientAccess', v)} label="Client-specific access" description="Users belonging to this project's client company can view it." disabled={form.visibility === 'private'} />
              </fieldset>
              <div className="span-2">
                <span className="field-label">Authorized users</span>
                <div style={{ marginTop: 8 }}>
                  {grants.length === 0 && <p className="subtle">No individual users have been granted access yet.</p>}
                  {grants.map((g) => {
                    const u = userList.find((x) => x.id === g.userId);
                    const canManageLevel = isSuperAdmin && u?.role === 'project_admin';
                    const locked = g.level === 'manage' && !isSuperAdmin;
                    return (
                      <div key={g.userId} className="access-row">
                        <span className="person"><span className="avatar">{initials(u?.name)}</span><span className="person-text"><strong>{u?.name ?? `User #${g.userId}`}</strong><span>{u?.email} — {u ? ROLE_LABELS[u.role] : ''}</span></span></span>
                        <select className="select" aria-label={`Access level for ${u?.name}`} value={g.level} disabled={locked} onChange={(e) => { setGrants((gs) => gs.map((x) => (x.userId === g.userId ? { ...x, level: e.target.value as AccessLevel } : x))); setDirty(true); }}>
                          {(Object.keys(ACCESS_LABELS) as AccessLevel[]).filter((l) => l !== 'manage' || canManageLevel || g.level === 'manage').map((l) => <option key={l} value={l}>{ACCESS_LABELS[l].label} — {ACCESS_LABELS[l].description}</option>)}
                        </select>
                        <button type="button" className="btn btn-ghost icon-btn" disabled={locked} aria-label={`Revoke access for ${u?.name}`} onClick={() => { setGrants((gs) => gs.filter((x) => x.userId !== g.userId)); setDirty(true); }}><Trash2 size={15} /></button>
                      </div>
                    );
                  })}
                  <div className="row" style={{ marginTop: 10 }}>
                    <select className="select" style={{ flex: 1, minWidth: 200 }} aria-label="Choose a user to authorise" value={grantUser} onChange={(e) => setGrantUser(e.target.value)}>
                      <option value="">Choose a user…</option>
                      {grantable.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email}) — {ROLE_LABELS[u.role]}</option>)}
                    </select>
                    <button type="button" className="btn" disabled={!grantUser} onClick={() => { setGrants((gs) => [...gs, { userId: Number(grantUser), level: 'view' }]); setGrantUser(''); setDirty(true); }}><Plus size={15} />Grant access</button>
                  </div>
                  <p className="field-hint" style={{ marginTop: 8 }}>Super Admins always have full access. Access changes are recorded in the activity log.</p>
                </div>
              </div>
              <Field label="Approval status">
                {(p) => <select {...p} className="select" {...input('approvalStatus')}><option value="draft">Draft</option><option value="pending_review">Pending review</option><option value="approved">Approved</option></select>}
              </Field>
              <Switch checked={form.contactApproved} onChange={(v) => set('contactApproved', v)} label="Show owner & support contact to viewers" description="Otherwise visible only with technical access." />
              <Field label="Internal notes" hint="Visible only to project managers and Super Admins." className="span-2">{(p) => <textarea {...p} className="textarea" {...input('internalNotes')} />}</Field>
            </div>
          </section>

          {/* G — Lifecycle */}
          <section id="lifecycle" className="panel form-section">
            <div className="panel-header"><h2><span className="letter">G</span>Maintenance &amp; lifecycle</h2></div>
            <div className="form-grid">
              <Field label="Project status" hint="Archive from Project Management.">{(p) => <select {...p} className="select" {...input('status')}>{EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select>}</Field>
              <Field label="Support contact or team" hint="Use a role mailbox or team name you are authorised to share.">{(p) => <input {...p} className="input" {...input('supportContact')} />}</Field>
              <Field label="Last maintenance date">{(p) => <input {...p} type="date" className="input" {...input('lastMaintenanceDate')} />}</Field>
              <Field label="Next maintenance date" hint="Reminders appear 14 days before.">{(p) => <input {...p} type="date" className="input" {...input('nextMaintenanceDate')} />}</Field>
              <Field label="Project review date">{(p) => <input {...p} type="date" className="input" {...input('reviewDate')} />}</Field>
              <Field label="Expiration / decommission date">{(p) => <input {...p} type="date" className="input" {...input('decommissionDate')} />}</Field>
              <Field label="Maintenance notes" className="span-2">{(p) => <textarea {...p} className="textarea" {...input('maintenanceNotes')} />}</Field>
            </div>
          </section>
        </div>

        <aside className="preview-col" aria-label="Card preview">
          <div className="subtle" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.72rem' }}>Live card preview</div>
          <ProjectCard project={preview} preview />
          <div className="panel" style={{ padding: 16 }}>
            <div className="stack" style={{ gap: 8, fontSize: '0.84rem' }}>
              {[
                [form.name.trim().length >= 2, 'Project name'],
                [!!form.categoryId, 'Category selected'],
                [!!form.clientId, 'Client linked'],
                [!!media.cover, 'Cover image'],
                [dashboards.length > 0, 'At least one dashboard'],
                [!!form.shortDescription, 'Short description'],
              ].map(([ok, label]) => (
                <span key={String(label)} className="row" style={{ gap: 8, color: ok ? 'var(--success)' : 'var(--text-3)' }}><CheckCircle2 size={15} />{label}</span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="sticky-actions">
        <Link to={isNew ? '/admin/projects' : `/projects/${project.data!.project.slug}`} className="btn btn-ghost">Cancel</Link>
        <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>{saving ? <Spinner /> : <Save size={17} />}{isNew ? 'Create project' : 'Save changes'}</button>
      </div>

      {clientModal && (
        <ClientFormModal client={null} onClose={() => setClientModal(false)} onSaved={(c) => {
          clients.setData((d) => d && { clients: [...d.clients, c] });
          set('clientId', c.id);
          setClientModal(false);
        }} />
      )}
    </form>
  );
}
