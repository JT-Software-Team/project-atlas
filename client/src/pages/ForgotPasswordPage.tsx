import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Alert, Field, Spinner } from '../components/ui';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    setError(undefined);
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>('/auth/forgot', { email: email.trim() });
      setDone(res.message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div>
          <h2 style={{ fontSize: '1.15rem' }}>Reset your password</h2>
          <p className="subtle" style={{ marginTop: 4 }}>Enter your account email and we'll send a single-use reset link.</p>
        </div>
        {done ? (
          <Alert tone="success">{done} The link expires in 60 minutes. If nothing arrives, contact your administrator.</Alert>
        ) : (
          <>
            <Field label="Email address" error={error}>
              {(p) => (
                <div className="input-wrap">
                  <Mail size={17} aria-hidden="true" />
                  <input {...p} className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
                </div>
              )}
            </Field>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? <><Spinner /> Sending…</> : 'Send reset link'}</button>
          </>
        )}
        <Link to="/login" className="back-link" style={{ margin: 0, justifyContent: 'center' }}><ArrowLeft size={15} /> Back to sign in</Link>
      </form>
    </AuthLayout>
  );
}
