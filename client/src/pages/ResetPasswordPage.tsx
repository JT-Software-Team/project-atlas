import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Eye, EyeOff, Lock } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Alert, Field, FullScreenLoader, Spinner } from '../components/ui';
import { AuthLayout } from './AuthLayout';

const RULES = [
  { test: (p: string) => p.length >= 10, label: 'At least 10 characters' },
  { test: (p: string) => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length >= 3, label: 'Three of: lowercase, uppercase, number, symbol' },
];

export function ResetPasswordPage() {
  // The token travels in the URL fragment so it is never sent to servers or leaked via Referer.
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [info, setInfo] = useState<{ purpose: 'reset' | 'invite'; name: string; email: string } | null>(null);
  const [invalid, setInvalid] = useState<string>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid('This link is incomplete. Request a new one.'); return; }
    api.post<{ purpose: 'reset' | 'invite'; name: string; email: string }>('/auth/reset/check', { token })
      .then(setInfo)
      .catch((e: ApiError) => setInvalid(e.message));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!RULES.every((r) => r.test(password))) { setError('Choose a stronger password.'); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setError(undefined);
    setBusy(true);
    try {
      await api.post('/auth/reset', { token, password });
      setDone(true);
      history.replaceState(null, '', window.location.pathname);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (!info && !invalid) return <FullScreenLoader label="Checking your link…" />;

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} noValidate>
        {invalid ? (
          <>
            <Alert tone="error">{invalid}</Alert>
            <Link to="/forgot-password" className="btn btn-primary btn-block">Request a new link</Link>
          </>
        ) : done ? (
          <>
            <Alert tone="success">Your password has been set. Please sign in with your new password.</Alert>
            <Link to="/login" className="btn btn-primary btn-block">Go to sign in</Link>
          </>
        ) : (
          <>
            <div>
              <h2 style={{ fontSize: '1.15rem' }}>{info!.purpose === 'invite' ? `Welcome, ${info!.name}` : 'Choose a new password'}</h2>
              <p className="subtle" style={{ marginTop: 4 }}>{info!.purpose === 'invite' ? 'Set a password to activate your account' : 'Resetting the password for'} <strong>{info!.email}</strong>.</p>
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="New password">
              {(p) => (
                <div className="input-wrap">
                  <Lock size={17} aria-hidden="true" />
                  <input {...p} className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 46 }} />
                  <button type="button" className="btn btn-ghost icon-btn btn-sm input-action" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              )}
            </Field>
            <ul style={{ margin: '-6px 0 0', padding: 0, listStyle: 'none', fontSize: '0.8rem' }}>
              {RULES.map((r) => (
                <li key={r.label} style={{ display: 'flex', gap: 6, alignItems: 'center', color: r.test(password) ? 'var(--success)' : 'var(--text-3)' }}><Check size={14} aria-hidden="true" />{r.label}</li>
              ))}
            </ul>
            <Field label="Confirm password">
              {(p) => <input {...p} className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
            </Field>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? <><Spinner /> Saving…</> : 'Set password'}</button>
          </>
        )}
        <Link to="/login" className="back-link" style={{ margin: 0, justifyContent: 'center' }}><ArrowLeft size={15} /> Back to sign in</Link>
      </form>
    </AuthLayout>
  );
}
