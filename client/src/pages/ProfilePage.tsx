import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Monitor, UserCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { api, ApiError } from '../lib/api';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../lib/catalog';
import { formatDateTime, timeAgo } from '../lib/format';
import { useToast } from '../components/Toast';
import { Alert, Field, PageHeader, Spinner } from '../components/ui';

interface Session { current: boolean; createdAt: string; lastSeenAt: string; expiresAt: string; remember: boolean; ip: string | null; userAgent: string | null }

export function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  const sessions = useApi<{ sessions: Session[] }>('/auth/sessions');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) { setErrors({ confirm: 'The passwords do not match.' }); return; }
    setBusy(true); setErrors({});
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast('Password changed. Other sessions were signed out.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      sessions.reload();
    } catch (err) {
      const ae = err as ApiError;
      setErrors(ae.fields ?? { _: ae.message });
    } finally { setBusy(false); }
  };

  const revokeOthers = async () => {
    await api.post('/auth/sessions/revoke-others');
    toast('Signed out of all other sessions');
    sessions.reload();
  };

  return (
    <>
      <PageHeader eyebrow="Account" title="Profile & security" />
      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <div className="panel-header"><h2><KeyRound size={18} />Change password</h2></div>
            <form className="stack" onSubmit={submit} noValidate style={{ gap: 14 }}>
              {errors._ && <Alert tone="error">{errors._}</Alert>}
              <Field label="Current password" error={errors.currentPassword}>{(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />}</Field>
              <Field label="New password" error={errors.newPassword} hint="At least 10 characters using three of: lowercase, uppercase, numbers, symbols.">{(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />}</Field>
              <Field label="Confirm new password" error={errors.confirm}>{(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}</Field>
              <div><button className="btn btn-primary" disabled={busy}>{busy && <Spinner />}Update password</button></div>
            </form>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2><Monitor size={18} />Active sessions</h2>
              <button className="btn btn-sm" onClick={revokeOthers}><LogOut size={14} />Sign out other sessions</button>
            </div>
            <div className="mini-list">
              {sessions.data?.sessions.map((s, i) => (
                <div key={i} className="mini-item">
                  <Monitor size={18} />
                  <span className="mini-body"><strong>{s.userAgent?.slice(0, 80) || 'Unknown device'}</strong><span>{s.ip ?? 'Unknown IP'} — active {timeAgo(s.lastSeenAt)} — expires {formatDateTime(s.expiresAt)}</span></span>
                  {s.current && <span className="badge badge-success">This device</span>}
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="panel">
          <div className="panel-header"><h2><UserCircle size={18} />Your account</h2></div>
          <dl className="kv">
            <dt>Name</dt><dd>{user!.name}</dd>
            <dt>Email</dt><dd>{user!.email}</dd>
            <dt>Role</dt><dd>{ROLE_LABELS[user!.role]}<div className="subtle">{ROLE_DESCRIPTIONS[user!.role]}</div></dd>
            {user!.clientName && <><dt>Organisation</dt><dd>{user!.clientName}</dd></>}
            <dt>Last sign-in</dt><dd>{formatDateTime(user!.lastLoginAt)}</dd>
          </dl>
          <p className="subtle" style={{ marginTop: 16 }}>To change your name, role or project access, contact a Super Admin.</p>
        </section>
      </div>
    </>
  );
}
