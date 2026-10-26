import { useEffect, useState } from 'react';
import { Copy, KeyRound, LogOut, MoreHorizontal, Pencil, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { ACCESS_LABELS, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/catalog';
import { initials, timeAgo } from '../../lib/format';
import type { AccessLevel, Client, ManagedUser, ProjectCard, Role } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { Alert, ConfirmDialog, ErrorState, Field, Modal, PageHeader, Spinner, StateMessage, Switch } from '../../components/ui';

function LinkBox({ link }: { link: string }) {
  const toast = useToast();
  return (
    <div className="link-box">
      <span style={{ flex: 1 }}>{link}</span>
      <button type="button" className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(link); toast('Link copied', 'info'); }}><Copy size={14} />Copy</button>
    </div>
  );
}

function UserFormModal({ user, clients, onClose, onSaved }: { user: ManagedUser | null; clients: Client[]; onClose: () => void; onSaved: () => void }) {
  const { isSuperAdmin } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    name: user?.name ?? '', email: user?.email ?? '', role: (user?.role ?? 'viewer') as Role,
    clientId: user?.clientId ? String(user.clientId) : '', active: user?.active ?? true, unlock: false, sendEmail: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string>();

  const save = async () => {
    setBusy(true); setErrors({}); setError(undefined);
    try {
      if (user) {
        await api.put(`/users/${user.id}`, { name: form.name, role: form.role, clientId: form.clientId || null, active: form.active, unlock: form.unlock });
        toast('User updated');
        onSaved();
      } else {
        const res = await api.post<{ inviteLink: string }>('/users', { name: form.name, email: form.email, role: form.role, clientId: form.clientId || null, sendEmail: form.sendEmail });
        setInviteLink(res.inviteLink);
        toast('User invited');
      }
    } catch (e) {
      const ae = e as ApiError;
      setErrors(ae.fields ?? {});
      setError(ae.message);
    } finally { setBusy(false); }
  };

  if (inviteLink) {
    return (
      <Modal title="Invitation created" onClose={onSaved} footer={<button className="btn btn-primary" onClick={onSaved}>Done</button>}>
        <Alert tone="success">{form.name} has been added. {form.sendEmail ? 'An invitation email was queued.' : ''} Share this single-use link securely if needed. It expires in 72 hours and will not be shown again.</Alert>
        <LinkBox link={inviteLink} />
      </Modal>
    );
  }

  return (
    <Modal title={user ? `Edit ${user.name}` : 'Invite user'} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}{user ? 'Save changes' : 'Create & invite'}</button></>}>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Full name" required error={errors.name}>{(p) => <input {...p} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
      <Field label="Email" required error={errors.email} hint={user ? 'Email cannot be changed.' : undefined}>{(p) => <input {...p} className="input" type="email" disabled={!!user} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
      <Field label="Role" hint={ROLE_DESCRIPTIONS[form.role]}>
        {(p) => (
          <select
            {...p}
            className="select"
            value={form.role}
            disabled={user?.role === 'super_admin' && !isSuperAdmin}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            {(Object.keys(ROLE_LABELS) as Role[])
              .filter((r) => r !== 'super_admin' || isSuperAdmin)
              .map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
          </select>
        )}
      </Field>
      <Field label="Organisation" hint="Link approved client users to their company to use client-specific access.">
        {(p) => <select {...p} className="select" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}><option value="">Janyutech (internal)</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      </Field>
      {user ? (
        <>
          <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Account active" description="Disabling signs the user out everywhere and blocks sign-in." />
          {user.locked && <Switch checked={form.unlock} onChange={(v) => setForm({ ...form, unlock: v })} label="Unlock account" description="Clears the temporary lock after failed sign-in attempts." />}
        </>
      ) : (
        <Switch checked={form.sendEmail} onChange={(v) => setForm({ ...form, sendEmail: v })} label="Send invitation email" description="You will also see the link once after creating the user." />
      )}
    </Modal>
  );
}

function AccessModal({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const toast = useToast();
  const projects = useApi<{ projects: ProjectCard[] }>('/projects?sort=name_asc&archived=include');
  const current = useApi<{ grants: { projectId: number; level: AccessLevel }[] }>(`/users/${user.id}/access`);
  const [grants, setGrants] = useState<Record<number, AccessLevel | ''>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { if (current.data) setGrants(Object.fromEntries(current.data.grants.map((g) => [g.projectId, g.level]))); }, [current.data]);

  const save = async () => {
    setBusy(true); setError(undefined);
    try {
      await api.put(`/users/${user.id}/access`, { grants: Object.entries(grants).filter(([, l]) => l).map(([projectId, level]) => ({ projectId: Number(projectId), level })) });
      toast(`Access updated for ${user.name}`);
      onClose();
    } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };

  return (
    <Modal wide title={`Project access: ${user.name}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy || user.role === 'super_admin'}>{busy && <Spinner />}Save access</button></>}>
      {user.role === 'super_admin' ? <Alert tone="info">Super Admins have full access to every project.</Alert> : (
        <>
          <p className="subtle">Grant this {ROLE_LABELS[user.role]} access to specific projects. Users may also see projects through role-wide or client access configured on the project.</p>
          {error && <Alert tone="error">{error}</Alert>}
          {projects.loading || current.loading ? <div className="skeleton" style={{ height: 160 }} /> : (
            <div>
              {projects.data!.projects.map((p) => (
                <div key={p.id} className="access-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 220px' }}>
                  <span className="person-text"><strong>{p.name}</strong><span>{p.client?.name ?? 'Client to be added'}{p.archived ? ' (archived)' : ''}</span></span>
                  <select className="select" aria-label={`Access to ${p.name}`} value={grants[p.id] ?? ''} onChange={(e) => setGrants({ ...grants, [p.id]: e.target.value as AccessLevel | '' })}>
                    <option value="">No individual access</option>
                    {(Object.keys(ACCESS_LABELS) as AccessLevel[]).filter((l) => l !== 'manage' || user.role === 'project_admin').map((l) => <option key={l} value={l}>{ACCESS_LABELS[l].label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export function UsersPage() {
  const { user: me, isSuperAdmin } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ users: ManagedUser[] }>('/users');
  const clients = useApi<{ clients: Client[] }>('/clients');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ kind: 'edit' | 'access' | 'new' | 'revoke' | 'delete'; user?: ManagedUser } | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [resetLink, setResetLink] = useState<{ user: ManagedUser; link: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const users = (data?.users ?? []).filter((u) => !q || `${u.name} ${u.email} ${u.clientName ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  const issueReset = async (u: ManagedUser) => {
    setMenuFor(null);
    try {
      const res = await api.post<{ link: string }>(`/users/${u.id}/reset-link`);
      setResetLink({ user: u, link: res.link });
    } catch (e) { toast((e as ApiError).message, 'error'); }
  };
  const revoke = async () => {
    if (!modal?.user) return;
    setBusy(true);
    try { await api.post(`/users/${modal.user.id}/revoke-sessions`); toast(`Signed out all sessions for ${modal.user.name}`); setModal(null); reload(); }
    catch (e) { toast((e as ApiError).message, 'error'); } finally { setBusy(false); }
  };
  const deleteUser = async () => {
    if (!modal?.user) return;
    setBusy(true);
    try {
      await api.del(`/users/${modal.user.id}`);
      toast(`User ${modal.user.name} deleted`);
      setModal(null);
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Administration" title="User Management" description="Invite users, assign roles, grant project access and disable accounts."
        actions={<button className="btn btn-primary" onClick={() => setModal({ kind: 'new' })}><UserPlus size={16} />Invite user</button>} />
      <div className="toolbar"><div className="input-wrap"><Search size={17} aria-hidden="true" /><input className="input" type="search" placeholder="Search users" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />
        : !users.length ? <StateMessage icon={<Users size={28} />} title="No users found" message="Try a different search." />
        : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Project grants</th><th>Last sign-in</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : 0.6 }}>
                    <td><span className="person"><span className="avatar">{initials(u.name)}</span><span className="person-text"><strong>{u.name}{u.id === me?.id && <span className="subtle"> (you)</span>}</strong><span>{u.email}{u.clientName ? ` — ${u.clientName}` : ''}</span></span></span></td>
                    <td><span className={`badge ${u.role === 'super_admin' ? 'badge-accent' : u.role === 'project_admin' ? 'badge-info' : ''}`}>{ROLE_LABELS[u.role]}</span></td>
                    <td>
                      {!u.active ? <span className="badge badge-error">Disabled</span>
                        : u.locked ? <span className="badge badge-warning">Locked</span>
                        : u.invitePending ? <span className="badge badge-warning">Invite pending</span>
                        : <span className="badge badge-success">Active</span>}
                    </td>
                    <td>{u.role === 'super_admin' ? <span className="subtle">All projects</span> : u.projectGrants}</td>
                    <td className="muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</td>
                    <td>
                      <div className="actions" style={{ position: 'relative' }}>
                        <button
                          className="btn btn-sm"
                          disabled={u.role === 'super_admin'}
                          title={u.role === 'super_admin' ? 'Super Admins have full access to every project' : undefined}
                          onClick={() => setModal({ kind: 'access', user: u })}
                        >
                          <ShieldCheck size={14} />Access
                        </button>
                        <button
                          className="btn btn-sm icon-btn"
                          disabled={u.role === 'super_admin' && !isSuperAdmin}
                          title={u.role === 'super_admin' && !isSuperAdmin ? 'Only Super Admins can edit Super Admin accounts' : undefined}
                          onClick={() => setModal({ kind: 'edit', user: u })}
                          aria-label={`Edit ${u.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-sm btn-ghost icon-btn" aria-label={`More actions for ${u.name}`} aria-expanded={menuFor === u.id} onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}><MoreHorizontal size={16} /></button>
                        {menuFor === u.id && (
                          <div className="menu" role="menu" onMouseLeave={() => setMenuFor(null)}>
                            <button
                              className="menu-item"
                              role="menuitem"
                              disabled={u.role === 'super_admin' && !isSuperAdmin}
                              title={u.role === 'super_admin' && !isSuperAdmin ? 'Only Super Admins can manage Super Admin credentials' : undefined}
                              onClick={() => {
                                if (u.role === 'super_admin' && !isSuperAdmin) return;
                                issueReset(u);
                              }}
                            >
                              <KeyRound size={16} />{u.invitePending ? 'Re-issue invitation link' : 'Issue password reset link'}
                            </button>
                            <button
                              className="menu-item"
                              role="menuitem"
                              disabled={u.role === 'super_admin'}
                              title={u.role === 'super_admin' ? 'Signing out all sessions is disabled for Super Admin accounts' : undefined}
                              onClick={() => {
                                if (u.role === 'super_admin') return;
                                setMenuFor(null);
                                setModal({ kind: 'revoke', user: u });
                              }}
                            >
                              <LogOut size={16} />Sign out all sessions ({u.activeSessions})
                            </button>
                            <div className="menu-sep" />
                            <button
                              className="menu-item"
                              role="menuitem"
                              disabled={u.role === 'super_admin' || !isSuperAdmin || u.id === me?.id}
                              title={
                                u.role === 'super_admin'
                                  ? 'Super Admin accounts cannot be deleted'
                                  : !isSuperAdmin
                                  ? 'Only Super Admins can delete users'
                                  : u.id === me?.id
                                  ? 'You cannot delete your own account'
                                  : undefined
                              }
                              style={{ color: u.role === 'super_admin' || !isSuperAdmin || u.id === me?.id ? undefined : 'var(--error)' }}
                              onClick={() => {
                                if (u.role === 'super_admin' || !isSuperAdmin || u.id === me?.id) return;
                                setMenuFor(null);
                                setModal({ kind: 'delete', user: u });
                              }}
                            >
                              <Trash2 size={16} />Delete user
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {(modal?.kind === 'new' || modal?.kind === 'edit') && (
        <UserFormModal user={modal.user ?? null} clients={clients.data?.clients ?? []} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {modal?.kind === 'access' && modal.user && <AccessModal user={modal.user} onClose={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'revoke' && modal.user && (
        <ConfirmDialog title="Sign out all sessions?" confirmLabel="Sign out" busy={busy} onCancel={() => setModal(null)} onConfirm={revoke}
          message={<>{modal.user.name} will be signed out on every device and must sign in again.</>} />
      )}
      {modal?.kind === 'delete' && modal.user && (
        <ConfirmDialog
          danger
          title={`Delete ${modal.user.name}?`}
          confirmLabel="Delete user"
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={deleteUser}
          message={
            <>Are you sure you want to permanently delete <strong>{modal.user.name}</strong> ({modal.user.email})? This action cannot be undone.</>
          }
        />
      )}
      {resetLink && (
        <Modal title="Password link issued" onClose={() => setResetLink(null)} footer={<button className="btn btn-primary" onClick={() => setResetLink(null)}>Done</button>}>
          <Alert tone="success">A link was emailed to {resetLink.user.email}. You can also share it securely. It works once and is shown only now.</Alert>
          <LinkBox link={resetLink.link} />
        </Modal>
      )}
    </>
  );
}
