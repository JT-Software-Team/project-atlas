import { useEffect, useState } from 'react';
import {
  Eye, EyeOff, KeyRound, LogOut, MoreHorizontal, Pencil, Search, ShieldCheck, Sparkles, Trash2, UserPlus, Users
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { ACCESS_LABELS, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/catalog';
import { formatDate, initials, timeAgo } from '../../lib/format';
import type { AccessLevel, Client, ManagedUser, ProjectCard, Role } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { Alert, ConfirmDialog, ErrorState, Field, Modal, PageHeader, Spinner, StateMessage, Switch } from '../../components/ui';

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const parts = [
    pick(upper), pick(upper),
    pick(lower), pick(lower), pick(lower),
    pick(digits), pick(digits),
    pick(special),
  ];

  for (let i = 0; i < 4; i++) {
    parts.push(pick(all));
  }

  // Shuffle
  return parts.sort(() => Math.random() - 0.5).join('');
}

interface CreateUserModalProps {
  clients: Client[];
  onClose: () => void;
  onCreated: (createdUser: ManagedUser) => void;
}

function CreateUserModal({ clients, onClose, onCreated }: CreateUserModalProps) {
  const toast = useToast();
  const [form, setForm] = useState({
    userId: '',
    name: '',
    password: '',
    confirmPassword: '',
    role: 'viewer' as 'viewer' | 'admin' | 'super_admin',
    clientId: '',
    active: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const handleGenerate = () => {
    const generated = generateSecurePassword();
    setForm((prev) => ({ ...prev, password: generated, confirmPassword: generated }));
    setShowPassword(true);
    toast('Secure password generated', 'info');
  };

  const handleCreate = async () => {
    setBusy(true);
    setErrors({});
    setError(undefined);

    if (!form.userId.trim()) {
      setErrors((prev) => ({ ...prev, userId: 'User ID is required.' }));
      setBusy(false);
      return;
    }
    if (!form.password) {
      setErrors((prev) => ({ ...prev, password: 'Initial password is required.' }));
      setBusy(false);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match.' }));
      setBusy(false);
      return;
    }

    try {
      const res = await api.post<{ user: ManagedUser }>('/users', {
        userId: form.userId.trim(),
        name: form.name.trim() || form.userId.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        role: form.role,
        clientId: form.clientId ? Number(form.clientId) : null,
        active: form.active,
      });
      toast(`User ${res.user.email} created successfully`);
      onCreated(res.user);
    } catch (e) {
      const ae = e as ApiError;
      setErrors(ae.fields ?? {});
      setError(ae.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create User"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={busy}>
            {busy && <Spinner />}Create user
          </button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}

      <Field
        label="User ID"
        required
        error={errors.userId}
        hint="Unique login identifier (username or email). The user logs in with this ID."
      >
        {(p) => (
          <input
            {...p}
            className="input"
            placeholder="e.g. john.doe or operator1"
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
            autoFocus
          />
        )}
      </Field>

      <Field label="Full name" required error={errors.name}>
        {(p) => (
          <input
            {...p}
            className="input"
            placeholder="e.g. John Doe"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
      </Field>

      <Field
        label="Initial password"
        required
        error={errors.password}
        hint="Must be at least 10 characters with mixed letters and numbers/symbols."
      >
        {(p) => (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                {...p}
                type={showPassword ? 'text' : 'password'}
                className="input"
                placeholder="Enter or generate password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                className="btn btn-ghost icon-btn"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: 4 }}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleGenerate}
              title="Generate a secure random password"
            >
              <Sparkles size={14} />Generate
            </button>
          </div>
        )}
      </Field>

      <Field label="Confirm password" required error={errors.confirmPassword}>
        {(p) => (
          <input
            {...p}
            type={showPassword ? 'text' : 'password'}
            className="input"
            placeholder="Re-enter initial password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
        )}
      </Field>

      <Field label="Role" required hint={ROLE_DESCRIPTIONS[form.role]}>
        {(p) => (
          <select
            {...p}
            className="select"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'viewer' | 'admin' | 'super_admin' })}
          >
            <option value="viewer">Viewer (Browse pages & projects; dashboard links restricted)</option>
            <option value="admin">Admin (Browse projects & open authorized dashboards)</option>
            <option value="super_admin">Super Admin (Full control, manage users & data)</option>
          </select>
        )}
      </Field>

      <Field label="Organisation" hint="Link client users to their organisation for client-specific access.">
        {(p) => (
          <select
            {...p}
            className="select"
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          >
            <option value="">Janyutech (internal)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </Field>

      <Switch
        checked={form.active}
        onChange={(v) => setForm({ ...form, active: v })}
        label="Account status"
        description="Active by default. Newly created users can log in immediately when active."
      />
    </Modal>
  );
}

interface EditUserModalProps {
  user: ManagedUser;
  clients: Client[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EditUserModal({ user, clients, isSelf, onClose, onSaved }: EditUserModalProps) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: user.name,
    role: user.role,
    clientId: user.clientId ? String(user.clientId) : '',
    active: user.active,
    unlock: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    setErrors({});
    setError(undefined);

    try {
      await api.put(`/users/${user.id}`, {
        name: form.name.trim(),
        role: form.role,
        clientId: form.clientId ? Number(form.clientId) : null,
        active: form.active,
        unlock: form.unlock,
      });
      toast(`User ${user.email} updated`);
      onSaved();
    } catch (e) {
      const ae = e as ApiError;
      setErrors(ae.fields ?? {});
      setError(ae.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Edit User: ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
            {busy && <Spinner />}Save changes
          </button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}

      <Field label="User ID" hint="User ID cannot be modified after creation.">
        {(p) => <input {...p} className="input" disabled value={user.email} />}
      </Field>

      <Field label="Full name" required error={errors.name}>
        {(p) => (
          <input
            {...p}
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
      </Field>

      <Field label="Role" hint={ROLE_DESCRIPTIONS[form.role]}>
        {(p) => (
          <select
            {...p}
            className="select"
            value={form.role}
            disabled={isSelf}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="viewer">Viewer (Browse pages & projects; dashboard links restricted)</option>
            <option value="admin">Admin (Browse projects & open authorized dashboards)</option>
            <option value="super_admin">Super Admin (Full control, manage users & data)</option>
          </select>
        )}
      </Field>

      <Field label="Organisation">
        {(p) => (
          <select
            {...p}
            className="select"
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          >
            <option value="">Janyutech (internal)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </Field>

      <Switch
        checked={form.active}
        onChange={(v) => setForm({ ...form, active: v })}
        disabled={isSelf}
        label="Account active"
        description={isSelf ? 'You cannot deactivate your own account.' : 'Disabling signs the user out and prevents login.'}
      />

      {user.locked && (
        <Switch
          checked={form.unlock}
          onChange={(v) => setForm({ ...form, unlock: v })}
          label="Unlock account"
          description="Clears temporary account lock after repeated failed login attempts."
        />
      )}
    </Modal>
  );
}

interface ResetPasswordModalProps {
  user: ManagedUser;
  onClose: () => void;
  onSuccess: () => void;
}

function ResetPasswordModal({ user, onClose, onSuccess }: ResetPasswordModalProps) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const handleGenerate = () => {
    const generated = generateSecurePassword();
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
    toast('Secure password generated', 'info');
  };

  const handleReset = async () => {
    setBusy(true);
    setError(undefined);

    if (!password) {
      setError('Password is required.');
      setBusy(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setBusy(false);
      return;
    }

    try {
      await api.post(`/users/${user.id}/password`, { password, confirmPassword });
      toast(`Password reset successfully for ${user.name}`);
      onSuccess();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Reset Password: ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleReset} disabled={busy}>
            {busy && <Spinner />}Update password
          </button>
        </>
      }
    >
      <p className="subtle" style={{ marginBottom: 16 }}>
        Set a new password for User ID: <strong>{user.email}</strong>. Existing sessions will be terminated.
      </p>

      {error && <Alert tone="error">{error}</Alert>}

      <Field label="New password" required hint="Minimum 10 characters with mixed case and numbers/symbols.">
        {(p) => (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                {...p}
                type={showPassword ? 'text' : 'password'}
                className="input"
                placeholder="Enter or generate password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: 40 }}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-ghost icon-btn"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: 4 }}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleGenerate}
              title="Generate a secure random password"
            >
              <Sparkles size={14} />Generate
            </button>
          </div>
        )}
      </Field>

      <Field label="Confirm new password" required>
        {(p) => (
          <input
            {...p}
            type={showPassword ? 'text' : 'password'}
            className="input"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        )}
      </Field>
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

  useEffect(() => {
    if (current.data) {
      setGrants(Object.fromEntries(current.data.grants.map((g) => [g.projectId, g.level])));
    }
  }, [current.data]);

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.put(`/users/${user.id}/access`, {
        grants: Object.entries(grants)
          .filter(([, l]) => l)
          .map(([projectId, level]) => ({ projectId: Number(projectId), level })),
      });
      toast(`Access updated for ${user.name}`);
      onClose();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={`Project access: ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={busy || user.role === 'super_admin'}
          >
            {busy && <Spinner />}Save access
          </button>
        </>
      }
    >
      {user.role === 'super_admin' ? (
        <Alert tone="info">Super Admins have full access to every project.</Alert>
      ) : (
        <>
          <p className="subtle">
            Grant this {ROLE_LABELS[user.role] ?? user.role} access to specific projects.
          </p>
          {error && <Alert tone="error">{error}</Alert>}
          {projects.loading || current.loading ? (
            <div className="skeleton" style={{ height: 160 }} />
          ) : (
            <div>
              {projects.data!.projects.map((p) => (
                <div key={p.id} className="access-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 220px' }}>
                  <span className="person-text">
                    <strong>{p.name}</strong>
                    <span>{p.client?.name ?? 'Client to be added'}{p.archived ? ' (archived)' : ''}</span>
                  </span>
                  <select
                    className="select"
                    aria-label={`Access to ${p.name}`}
                    value={grants[p.id] ?? ''}
                    onChange={(e) => setGrants({ ...grants, [p.id]: e.target.value as AccessLevel | '' })}
                  >
                    <option value="">No individual access</option>
                    {(Object.keys(ACCESS_LABELS) as AccessLevel[])
                      .filter((l) => l !== 'manage' || user.role === 'project_admin')
                      .map((l) => (
                        <option key={l} value={l}>{ACCESS_LABELS[l].label}</option>
                      ))}
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
  const [modal, setModal] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; user: ManagedUser }
    | { kind: 'password'; user: ManagedUser }
    | { kind: 'access'; user: ManagedUser }
    | { kind: 'revoke'; user: ManagedUser }
    | { kind: 'delete'; user: ManagedUser }
    | { kind: 'created_success'; user: ManagedUser }
    | null
  >(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const users = (data?.users ?? []).filter((u) =>
    !q || `${u.name} ${u.email} ${ROLE_LABELS[u.role] ?? u.role} ${u.clientName ?? ''}`.toLowerCase().includes(q.toLowerCase())
  );

  const revoke = async () => {
    if (modal?.kind !== 'revoke') return;
    setBusy(true);
    try {
      await api.post(`/users/${modal.user.id}/revoke-sessions`);
      toast(`Signed out all sessions for ${modal.user.name}`);
      setModal(null);
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    if (modal?.kind !== 'delete') return;
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

  if (!isSuperAdmin) {
    return (
      <StateMessage
        tone="error"
        icon={<Users size={28} />}
        title="Access Restricted"
        message="Only an authenticated Super Admin can access User Management."
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="User Management"
        description="Create user accounts, assign roles, manage access, and reset passwords."
        actions={
          <button className="btn btn-primary" onClick={() => setModal({ kind: 'create' })}>
            <UserPlus size={16} />Create User
          </button>
        }
      />

      <div className="toolbar">
        <div className="input-wrap">
          <Search size={17} aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Search users by name, ID or role"
            aria-label="Search users"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />
      ) : !users.length ? (
        <StateMessage
          icon={<Users size={28} />}
          title="No users found"
          message="Try a different search or create a new user account."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User / ID</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Sign-In</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.active ? 1 : 0.6 }}>
                  <td>
                    <span className="person">
                      <span className="avatar">{initials(u.name)}</span>
                      <span className="person-text">
                        <strong>
                          {u.name}
                          {u.id === me?.id && <span className="subtle"> (you)</span>}
                        </strong>
                        <span>
                          <code>{u.email}</code>
                          {u.clientName ? ` — ${u.clientName}` : ''}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        u.role === 'super_admin' ? 'badge-accent' : u.role === 'admin' ? 'badge-info' : ''
                      }`}
                    >
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td>
                    {!u.active ? (
                      <span className="badge badge-error">Disabled</span>
                    ) : u.locked ? (
                      <span className="badge badge-warning">Locked</span>
                    ) : (
                      <span className="badge badge-success">Active</span>
                    )}
                  </td>
                  <td className="muted">{formatDate(u.createdAt)}</td>
                  <td className="muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</td>
                  <td>
                    <div className="actions" style={{ position: 'relative' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={u.role === 'super_admin'}
                        title={u.role === 'super_admin' ? 'Super Admins have full access to every project' : undefined}
                        onClick={() => setModal({ kind: 'access', user: u })}
                      >
                        <ShieldCheck size={14} />Access
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm icon-btn"
                        onClick={() => setModal({ kind: 'edit', user: u })}
                        aria-label={`Edit ${u.name}`}
                        title="Edit user"
                      >
                        <Pencil size={14} />
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm icon-btn"
                        onClick={() => setModal({ kind: 'password', user: u })}
                        aria-label={`Reset password for ${u.name}`}
                        title="Reset password"
                      >
                        <KeyRound size={14} />
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm btn-ghost icon-btn"
                        aria-label={`More actions for ${u.name}`}
                        aria-expanded={menuFor === u.id}
                        onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {menuFor === u.id && (
                        <div className="menu" role="menu" onMouseLeave={() => setMenuFor(null)}>
                          <button
                            type="button"
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
                            type="button"
                            className="menu-item"
                            role="menuitem"
                            disabled={u.role === 'super_admin' || u.id === me?.id}
                            title={
                              u.role === 'super_admin'
                                ? 'Super Admin accounts cannot be deleted'
                                : u.id === me?.id
                                ? 'You cannot delete your own account'
                                : undefined
                            }
                            style={{ color: u.role === 'super_admin' || u.id === me?.id ? undefined : 'var(--error)' }}
                            onClick={() => {
                              if (u.role === 'super_admin' || u.id === me?.id) return;
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

      {/* Create User Modal */}
      {modal?.kind === 'create' && (
        <CreateUserModal
          clients={clients.data?.clients ?? []}
          onClose={() => setModal(null)}
          onCreated={(newUser) => {
            reload();
            setModal({ kind: 'created_success', user: newUser });
          }}
        />
      )}

      {/* Create Success Modal */}
      {modal?.kind === 'created_success' && modal.user && (
        <Modal
          title="User Account Created"
          onClose={() => setModal(null)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setModal(null)}>
              Done
            </button>
          }
        >
          <Alert tone="success">
            User account created successfully!
          </Alert>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p>
              <strong>User ID (Login ID):</strong> <code>{modal.user.email}</code>
            </p>
            <p>
              <strong>Full Name:</strong> {modal.user.name}
            </p>
            <p>
              <strong>Role:</strong> {ROLE_LABELS[modal.user.role] ?? modal.user.role}
            </p>
            <p>
              <strong>Status:</strong> {modal.user.active ? 'Active (can log in immediately)' : 'Disabled'}
            </p>
            <p className="subtle" style={{ marginTop: 8 }}>
              You can now manually provide the User ID and initial password to this user. No email was sent or required.
            </p>
          </div>
        </Modal>
      )}

      {/* Edit User Modal */}
      {modal?.kind === 'edit' && modal.user && (
        <EditUserModal
          user={modal.user}
          clients={clients.data?.clients ?? []}
          isSelf={modal.user.id === me?.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
          }}
        />
      )}

      {/* Reset Password Modal */}
      {modal?.kind === 'password' && modal.user && (
        <ResetPasswordModal
          user={modal.user}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reload();
          }}
        />
      )}

      {/* Access Modal */}
      {modal?.kind === 'access' && modal.user && (
        <AccessModal
          user={modal.user}
          onClose={() => {
            setModal(null);
            reload();
          }}
        />
      )}

      {/* Revoke Sessions Confirmation */}
      {modal?.kind === 'revoke' && modal.user && (
        <ConfirmDialog
          title="Sign out all sessions?"
          confirmLabel="Sign out"
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={revoke}
          message={
            <>{modal.user.name} will be signed out on every device and must sign in again.</>
          }
        />
      )}

      {/* Delete User Confirmation */}
      {modal?.kind === 'delete' && modal.user && (
        <ConfirmDialog
          danger
          title={`Delete ${modal.user.name}?`}
          confirmLabel="Delete user"
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={deleteUser}
          message={
            <>
              Are you sure you want to permanently delete <strong>{modal.user.name}</strong> ({modal.user.email})?
              This action cannot be undone.
            </>
          }
        />
      )}
    </>
  );
}
