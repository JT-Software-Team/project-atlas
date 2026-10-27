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
          <div className="cyber-ambient-halo" />
          <svg className="cyber-network-svg" viewBox="0 0 600 600" fill="none">
            {/* Concentric orbital rings with dashed styling */}
            <circle cx="300" cy="300" r="260" stroke="rgba(139, 92, 246, 0.16)" strokeWidth="1" strokeDasharray="4 8" className="cyber-ring-slow" />
            <circle cx="300" cy="300" r="215" stroke="rgba(34, 211, 238, 0.2)" strokeWidth="1" strokeDasharray="8 12" className="cyber-ring-reverse" />
            <circle cx="300" cy="300" r="160" stroke="rgba(139, 92, 246, 0.12)" strokeWidth="1" />

            {/* Subtle network connection arcs */}
            <path d="M 110 180 Q 280 120 480 200" stroke="url(#cyber-line-cyan)" strokeWidth="1.2" strokeDasharray="6 6" className="cyber-line-pulse" />
            <path d="M 120 420 Q 260 480 490 390" stroke="url(#cyber-line-purple)" strokeWidth="1.2" strokeDasharray="6 6" className="cyber-line-pulse" />
            <path d="M 180 90 Q 300 280 430 510" stroke="rgba(34, 211, 238, 0.12)" strokeWidth="1" />

            {/* Glowing connection nodes */}
            <circle cx="110" cy="180" r="3.5" fill="#22D3EE" className="cyber-node-pulse" />
            <circle cx="480" cy="200" r="4" fill="#8B5CF6" className="cyber-node-pulse-alt" />
            <circle cx="120" cy="420" r="3" fill="#22D3EE" className="cyber-node-pulse" />
            <circle cx="490" cy="390" r="3.5" fill="#A855F7" className="cyber-node-pulse-alt" />
            <circle cx="180" cy="90" r="2.5" fill="#38BDF8" />
            <circle cx="430" cy="510" r="3" fill="#22D3EE" />

            <defs>
              <linearGradient id="cyber-line-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.1" />
                <stop offset="50%" stopColor="#22D3EE" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="cyber-line-purple" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#C084FC" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.1" />
              </linearGradient>
            </defs>
          </svg>
          <img
            src="/brand/atlas-globe.webp"
            alt=""
            width={556}
            height={740}
            decoding="async"
            className="cyber-globe-img"
          />
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
