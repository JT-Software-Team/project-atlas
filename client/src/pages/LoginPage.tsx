import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Lock, Mail, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Alert, Field, Spinner } from '../components/ui';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const fillSuperAdmin = () => {
    setEmail('admin@atlas.local');
    setPassword('AtlasAdmin!2026');
    setErrors({});
    setFormError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password, remember);
      navigate(from, { replace: true });
    } catch (err) {
      const e = err as ApiError;
      const tone = e.status === 403 || e.status === 423 || e.status === 429 ? 'warning' : 'error';
      const text = e.fields ? 'Please check your details.' : (typeof e.message === 'string' ? e.message : 'Sign-in failed. Please verify credentials.');
      setFormError({ tone, text });
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} noValidate aria-describedby={formError ? 'login-error' : undefined}>
        <div className="auth-form-header">
          <div className="auth-form-title-row">
            <h2 className="auth-form-title">Sign in</h2>
            <button
              type="button"
              className="demo-pill-btn"
              onClick={fillSuperAdmin}
              title="Click to auto-fill Super Admin credentials"
            >
              <Sparkles size={13} aria-hidden="true" />
              <span>Use Admin Demo</span>
            </button>
          </div>
          <p className="subtle" style={{ marginTop: 4 }}>
            Enter your authorized Janyutech enterprise credentials.
          </p>
        </div>

        {formError && <div id="login-error"><Alert tone={formError.tone}>{formError.text}</Alert></div>}

        <Field label="Email address" error={errors.email}>
          {(p) => (
            <div className="input-wrap">
              <Mail size={17} aria-hidden="true" />
              <input
                {...p}
                className="input auth-input"
                type="email"
                autoComplete="username"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}
        </Field>

        <Field label="Password" error={errors.password}>
          {(p) => (
            <div className="input-wrap">
              <Lock size={17} aria-hidden="true" />
              <input
                {...p}
                className="input auth-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: 46 }}
              />
              <button
                type="button"
                className="btn btn-ghost icon-btn btn-sm input-action"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          )}
        </Field>

        <div className="auth-row">
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Keep me signed in for 30 days</span>
          </label>
          <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
        </div>

        <button className="btn btn-primary btn-lg btn-block auth-submit-btn" type="submit" disabled={busy}>
          {busy ? <><Spinner /> Authenticating…</> : <><KeyRound size={17} /> Sign in</>}
        </button>

        <div className="auth-credentials-hint">
          <span>Super Admin:</span> <code>admin@atlas.local</code> / <code>AtlasAdmin!2026</code>
        </div>
      </form>
    </AuthLayout>
  );
}
