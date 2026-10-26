import type { ReactNode } from 'react';
import { Activity, LayoutDashboard, Lock, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Brand';
import { SUBTITLE, TAGLINE } from '../lib/brand';

const FEATURES = [
  { icon: LayoutDashboard, title: 'Central Directory', text: 'All projects and dashboards' },
  { icon: ShieldCheck, title: 'Role-Based Access', text: 'Per-project permissions' },
  { icon: Activity, title: 'Full Audit Trail', text: 'Every change recorded' },
];

/** Split-screen composition shared by sign-in, forgot-password, reset and first-login pages. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-visual" aria-label="About Project Atlas">
        <div className="auth-visual-content">
          <p className="auth-eyebrow">Janyutech Enterprise Portal</p>
          <h2 className="auth-hero-heading">
            Every client project and monitoring dashboard, <span className="text-gradient">in one secure place.</span>
          </h2>
          <p className="auth-hero-desc">
            Project Atlas brings Janyutech's industrial automation and monitoring projects together for authorised employees and approved client users.
          </p>
        </div>

        <figure className="auth-hero-visual" aria-hidden="true">
          <img src="/brand/atlas-globe.webp" alt="" width={556} height={740} decoding="async" />
        </figure>

        <ul className="auth-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="auth-feature">
              <span className="auth-feature-icon" aria-hidden="true"><Icon size={17} /></span>
              <span>
                <strong>{title}</strong>
                <span>{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <main className="auth-panel">
        <div className="auth-card page-enter">
          <div className="auth-brand">
            <Logo size="lg" />
            <h1 className="auth-title">PROJECT ATLAS</h1>
            <p className="auth-subtitle">{SUBTITLE}</p>
            <p className="auth-tagline">{TAGLINE}</p>
          </div>

          {children}

          <footer className="auth-foot">
            <span className="auth-secure">
              <Lock size={13} aria-hidden="true" /> Authorised personnel only. Access is logged.
            </span>
            <span>© {new Date().getFullYear()} Janyutech. All rights reserved.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
