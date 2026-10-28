import type { CSSProperties, ReactNode } from 'react';
import { Activity, LayoutGrid, Lock, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Brand';
import { SUBTITLE, TAGLINE } from '../lib/brand';

const FEATURES = [
  { icon: LayoutGrid, title: 'Central Directory', text: 'All projects and dashboards' },
  { icon: ShieldCheck, title: 'Role Based Access', text: 'Per-project permissions' },
  { icon: Activity, title: 'Full Audit Trail', text: 'Every change recorded' },
] as const;

/** Split-screen composition shared by sign-in, forgot-password, reset and first-login pages. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-visual" aria-label="About Project Atlas">
        <div className="auth-scene" aria-hidden="true">
          <div className="auth-grid" />
          {/* Industrial plant with an engineer at a monitoring console (public/brand/login-scene.svg) */}
          <img className="auth-scene-art" src="/brand/login-scene.svg" alt="" width={960} height={900} decoding="async" draggable={false} />
        </div>

        <div className="auth-visual-content">
          <p className="auth-eyebrow reveal" style={{ '--d': '0.05s' } as CSSProperties}>Janyutech Enterprise Portal</p>
          <h2 className="auth-hero-heading reveal" style={{ '--d': '0.12s' } as CSSProperties}>
            Every client project and monitoring dashboard <span className="auth-accent">in one secure place</span>
          </h2>
          <p className="auth-hero-desc reveal" style={{ '--d': '0.2s' } as CSSProperties}>
            Project Atlas brings Janyutech's industrial automation and monitoring projects together for authorised employees and approved client users
          </p>
        </div>

        <ul className="auth-features">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="auth-feature reveal" style={{ '--d': `${0.3 + i * 0.08}s` } as CSSProperties}>
              <span className="auth-feature-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
              <span>
                <strong>{title}</strong>
                <span>{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="reveal" style={{ '--d': '0.1s' } as CSSProperties}><Logo size="lg" /></span>
            <h1 className="auth-title reveal" style={{ '--d': '0.16s' } as CSSProperties}>PROJECT ATLAS</h1>
            <p className="auth-subtitle reveal" style={{ '--d': '0.22s' } as CSSProperties}>{SUBTITLE}</p>
            <p className="auth-tagline reveal" style={{ '--d': '0.28s' } as CSSProperties}>{TAGLINE}</p>
            <span className="auth-divider" aria-hidden="true" />
          </div>

          <div className="auth-card-body reveal" style={{ '--d': '0.34s' } as CSSProperties}>{children}</div>

          <footer className="auth-foot">
            <span className="auth-secure">
              <Lock size={15} aria-hidden="true" /> Authorised personnel only, access is logged
            </span>
            <span>© {new Date().getFullYear()} Janyutech, all rights reserved</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
