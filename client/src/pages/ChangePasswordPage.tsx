import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Lock, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { Alert, Field, FullScreenLoader, Spinner } from '../components/ui';
import { AuthLayout } from './AuthLayout';

/** Shown after signing in with an initial (provisioned) password; the API allows nothing else until it is replaced. */
export function ChangePasswordPage() {
  const { status, user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (!user?.mustChangePassword) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.currentPassword) next.currentPassword = 'Enter your current password.';
    if (!form.newPassword) next.newPassword = 'Choose a new password.';
    else if (form.newPassword !== form.confirm) next.confirm = 'The passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      const ae = err as ApiError;
      setErrors(ae.fields ?? { _: ae.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="auth-form-header">
          <h2 className="auth-form-title">Set a new password</h2>
          <p className="auth-form-desc">
            Signed in as <strong>{user.email}</strong>. Replace your initial password to continue.
          </p>
        </div>

        {errors._ && <Alert tone="error">{errors._}</Alert>}

        <Field label="Current password" error={errors.currentPassword}>
          {(p) => (
            <div className="input-wrap">
              <Lock size={17} aria-hidden="true" />
              <input {...p} className="input auth-input" type="password" autoComplete="current-password"
                value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
            </div>
          )}
        </Field>

        <Field label="New password" error={errors.newPassword} hint="At least 10 characters using three of: lowercase, uppercase, numbers, symbols.">
          {(p) => (
            <div className="input-wrap">
              <KeyRound size={17} aria-hidden="true" />
              <input {...p} className="input auth-input" type={show ? 'text' : 'password'} autoComplete="new-password"
                value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} style={{ paddingRight: 46 }} />
              <button type="button" className="btn btn-ghost icon-btn btn-sm input-action" onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide passwords' : 'Show passwords'} aria-pressed={show}>
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          )}
        </Field>

        <Field label="Confirm new password" error={errors.confirm}>
          {(p) => (
            <div className="input-wrap">
              <KeyRound size={17} aria-hidden="true" />
              <input {...p} className="input auth-input" type={show ? 'text' : 'password'} autoComplete="new-password"
                value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </div>
          )}
        </Field>

        <button className="btn btn-primary btn-lg btn-block auth-submit-btn" type="submit" disabled={busy}>
          {busy ? <><Spinner /> Saving…</> : <><KeyRound size={17} /> Save and continue</>}
        </button>
        <button type="button" className="auth-text-btn" onClick={() => void logout()}>
          <LogOut size={15} aria-hidden="true" /> Sign out instead
        </button>
      </form>
    </AuthLayout>
  );
}
