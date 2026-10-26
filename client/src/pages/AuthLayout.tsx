import type { ReactNode } from 'react';
import { Activity, LayoutDashboard, Lock, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Brand';
import { SUBTITLE, TAGLINE } from '../lib/brand';

/** Split-screen composition shared by sign-in, forgot-password and reset pages. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      {/* Background ambient lighting */}
      <div className="auth-ambient-glow auth-glow-purple" aria-hidden="true" />
      <div className="auth-ambient-glow auth-glow-cyan" aria-hidden="true" />

      <section className="auth-visual" aria-label="Janyutech Enterprise Industrial Platform">
        {/* Subtle holographic grid backdrop */}
        <div className="auth-holo-grid" aria-hidden="true" />

        {/* Top Header info */}
        <div className="auth-visual-content">
          <div className="auth-eyebrow">
            <span className="pulse-dot" aria-hidden="true" />
            <span>JANYUTECH ENTERPRISE PORTAL</span>
          </div>
          <h2 className="auth-hero-heading">
            Every client project and monitoring dashboard, <span className="text-gradient">in one secure place.</span>
          </h2>
          <p className="auth-hero-desc">
            Project Atlas brings Janyutech's industrial automation and monitoring projects together for authorised employees and approved client users.
          </p>
        </div>

        {/* Center Futuristic Visual Hero Image with SVG overlay & beacons */}
        <div className="auth-hero-visual" aria-hidden="true">
          <div className="auth-image-frame">
            <img
              src="/brand/industrial-globe.jpg"
              alt="Futuristic global industrial monitoring network"
              className="auth-image-visual"
            />
            <div className="auth-image-overlay" />
            <div className="auth-image-vignette" />
          </div>

          {/* Holographic ring and telemetry data overlays */}
          <svg className="auth-telemetry-svg" viewBox="0 0 600 340" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="cyanPurple" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            {/* Ambient telemetry lines */}
            <path d="M 50 180 Q 200 80 320 160 T 550 120" stroke="url(#cyanPurple)" strokeWidth="1.5" strokeDasharray="6 6" className="stream-line" opacity="0.45" />
            <path d="M 80 240 Q 260 280 400 200 T 560 260" stroke="#22D3EE" strokeWidth="1" strokeDasharray="4 8" className="stream-line-rev" opacity="0.35" />
            {/* Glowing telemetry nodes */}
            <circle cx="320" cy="160" r="4" fill="#22D3EE" className="beacon-node" />
            <circle cx="320" cy="160" r="10" stroke="#22D3EE" strokeWidth="1" className="beacon-ping" />
            <circle cx="210" cy="120" r="3.5" fill="#8B5CF6" className="beacon-node" />
            <circle cx="440" cy="180" r="3.5" fill="#22D3EE" className="beacon-node" />
          </svg>
        </div>

        {/* Bottom Three Feature Cards */}
        <div className="auth-features">
          <div className="auth-feature">
            <div className="auth-feature-icon-wrap">
              <LayoutDashboard size={18} />
            </div>
            <div>
              <strong>Central directory</strong>
              <span>All projects and dashboards</span>
            </div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon-wrap">
              <ShieldCheck size={18} />
            </div>
            <div>
              <strong>Role-based access</strong>
              <span>Per-project permissions</span>
            </div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon-wrap">
              <Activity size={18} />
            </div>
            <div>
              <strong>Full audit trail</strong>
              <span>Every change recorded</span>
            </div>
          </div>
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
