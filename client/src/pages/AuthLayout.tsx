import type { ReactNode } from 'react';
import { Activity, LayoutDashboard, Lock, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Brand';
import { SUBTITLE, TAGLINE } from '../lib/brand';

/** Split-screen composition shared by sign-in, forgot-password and reset pages. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-visual" aria-hidden="true">
        <div className="auth-visual-content">
          <div className="eyebrow">Janyutech Enterprise Portal</div>
          <h2>Every client project and monitoring dashboard, in one secure place.</h2>
          <p>Project Atlas brings Janyutech's industrial automation and monitoring projects together for authorised employees and approved client users.</p>
        </div>
        <div className="auth-features">
          <div className="auth-feature"><LayoutDashboard size={20} /><strong>Central directory</strong><span>All projects and dashboards</span></div>
          <div className="auth-feature"><ShieldCheck size={20} /><strong>Role-based access</strong><span>Per-project permissions</span></div>
          <div className="auth-feature"><Activity size={20} /><strong>Full audit trail</strong><span>Every change recorded</span></div>
        </div>
      </section>
      <main className="auth-panel">
        <div className="auth-card page-enter">
          <div className="auth-brand">
            <Logo size="lg" />
            <div>
              <h1 className="auth-title">PROJECT ATLAS</h1>
              <p className="auth-subtitle">{SUBTITLE}</p>
            </div>
            <p className="auth-tagline">{TAGLINE}</p>
          </div>
          {children}
          <footer className="auth-foot">
            <span className="auth-secure"><Lock size={13} aria-hidden="true" /> Authorised personnel only. Access is logged.</span>
            <span>© {new Date().getFullYear()} Janyutech. All rights reserved.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
