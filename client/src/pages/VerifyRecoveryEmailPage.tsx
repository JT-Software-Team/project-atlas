import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Alert, FullScreenLoader, Spinner } from '../components/ui';
import { AuthLayout } from './AuthLayout';

export function VerifyRecoveryEmailPage() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [info, setInfo] = useState<{ email: string; name: string } | null>(null);
  const [invalid, setInvalid] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalid('This verification link is incomplete or missing a token.');
      return;
    }
    api.post<{ email: string; name: string }>('/auth/recovery-email/check', { token })
      .then(setInfo)
      .catch((e: ApiError) => setInvalid(e.message));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await api.post('/auth/recovery-email/verify', { token });
      setDone(true);
      history.replaceState(null, '', window.location.pathname);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (!info && !invalid) return <FullScreenLoader label="Checking your verification link…" />;

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} noValidate>
        {invalid ? (
          <>
            <div>
              <h2 style={{ fontSize: '1.15rem' }}>Verification link error</h2>
              <p className="subtle" style={{ marginTop: 4 }}>The verification link could not be verified.</p>
            </div>
            <Alert tone="error">{invalid}</Alert>
            <Link to="/login" className="btn btn-primary btn-block">Go to sign in</Link>
          </>
        ) : done ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <CheckCircle2 size={40} style={{ color: 'var(--success)', margin: '0 auto 8px' }} />
              <h2 style={{ fontSize: '1.15rem' }}>Recovery email verified</h2>
              <p className="subtle" style={{ marginTop: 4 }}>
                <strong>{info!.email}</strong> is now confirmed as your verified recovery destination.
              </p>
            </div>
            <Alert tone="success">Your recovery email has been verified successfully. Password reset links can now be delivered to this address.</Alert>
            <Link to="/profile" className="btn btn-primary btn-block">Return to profile</Link>
          </>
        ) : (
          <>
            <div>
              <h2 style={{ fontSize: '1.15rem' }}>Verify recovery email</h2>
              <p className="subtle" style={{ marginTop: 4 }}>
                Confirm <strong>{info!.email}</strong> as the recovery destination for <strong>{info!.name}</strong>.
              </p>
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <p className="subtle" style={{ fontSize: '0.875rem' }}>
              Once verified, this address will be used to receive password reset links if you ever lose access to your account.
            </p>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? <><Spinner /> Verifying…</> : 'Confirm & verify recovery email'}
            </button>
          </>
        )}
        <Link to="/login" className="back-link" style={{ margin: 0, justifyContent: 'center' }}>
          <ArrowLeft size={15} /> Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}
