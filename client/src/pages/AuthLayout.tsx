import type { CSSProperties, ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Logo } from '../components/Brand';
import { ParticleWave } from '../components/ParticleWave';
import { SUBTITLE } from '../lib/brand';

/** Split-screen composition shared by sign-in, forgot-password, reset and first-login pages. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-visual" aria-label="Project Atlas">
        <ParticleWave className="auth-wave" />
        <div className="auth-hero">
          <span className="reveal" style={{ '--d': '0.05s' } as CSSProperties}><Logo size="lg" /></span>
          <h1 className="auth-hero-title reveal" style={{ '--d': '0.12s' } as CSSProperties}>PROJECT ATLAS</h1>
          <p className="auth-hero-sub reveal" style={{ '--d': '0.2s' } as CSSProperties}>{SUBTITLE}</p>
        </div>
      </section>

      <main className="auth-panel">
        <div className="auth-content">
          <div className="auth-content-body reveal" style={{ '--d': '0.26s' } as CSSProperties}>{children}</div>

          <footer className="auth-foot reveal" style={{ '--d': '0.34s' } as CSSProperties}>
            <span className="auth-secure">
              <Lock size={16} aria-hidden="true" /> Authorised personnel only, access is logged
            </span>
            <span>© {new Date().getFullYear()} Janyutech, all rights reserved</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
