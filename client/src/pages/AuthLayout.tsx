import type { CSSProperties, ReactNode } from 'react';
import { Activity, LayoutGrid, Lock, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Brand';
import { SUBTITLE, TAGLINE } from '../lib/brand';

const FEATURES = [
  { icon: LayoutGrid, title: 'Central Directory', text: 'All projects and dashboards', tone: 'violet' },
  { icon: ShieldCheck, title: 'Role-Based Access', text: 'Per-project permissions', tone: 'cyan' },
  { icon: Activity, title: 'Full Audit Trail', text: 'Every change recorded', tone: 'violet' },
] as const;

/** Small deterministic PRNG so the skyline and particles render identically on every load. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const GROUND = 250;

// [x, width, height] — towers shrink towards the globe so the skyline fades out to the right.
const TOWERS: [number, number, number][] = [
  [6, 30, 120], [40, 22, 172], [66, 40, 96], [110, 18, 214], [132, 46, 132], [182, 26, 186],
  [212, 52, 112], [268, 20, 152], [292, 38, 92], [334, 16, 196], [354, 44, 118], [402, 30, 78],
  [436, 22, 136], [462, 48, 82], [514, 18, 112], [536, 40, 62], [580, 26, 88], [610, 44, 48],
];
// [x, height] — industrial chimney stacks carrying blinking aviation lights.
const STACKS: [number, number][] = [[56, 226], [124, 244], [198, 222], [346, 232], [452, 176]];
// [cx, rx] — storage tanks sitting on the ground line.
const TANKS: [number, number][] = [[246, 24], [420, 18], [600, 22]];

const WINDOWS = (() => {
  const rand = seeded(7);
  const out: { x: number; y: number; warm: boolean; twinkle: boolean; delay: number }[] = [];
  for (const [x, w, h] of TOWERS) {
    for (let wy = GROUND - h + 8; wy < GROUND - 6; wy += 9) {
      for (let wx = x + 4; wx < x + w - 4; wx += 7) {
        if (rand() > 0.42) continue;
        out.push({ x: wx, y: wy, warm: rand() > 0.42, twinkle: rand() > 0.82, delay: rand() * 6 });
      }
    }
  }
  return out;
})();

const PARTICLES = (() => {
  const rand = seeded(42);
  return Array.from({ length: 22 }, () => ({
    left: `${(rand() * 100).toFixed(1)}%`,
    top: `${(20 + rand() * 75).toFixed(1)}%`,
    size: 1.5 + rand() * 2.5,
    delay: rand() * 10,
    duration: 9 + rand() * 9,
    cyan: rand() > 0.5,
  }));
})();

function Skyline() {
  const city = (
    <>
      {TOWERS.map(([x, w, h]) => (
        <rect key={`t${x}`} x={x} y={GROUND - h} width={w} height={h} fill="url(#sky-tower)" stroke="rgba(99, 102, 241, 0.22)" strokeWidth="0.6" />
      ))}
      {STACKS.map(([x, h]) => (
        <g key={`s${x}`}>
          <rect x={x} y={GROUND - h} width={6} height={h} fill="#0A1030" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.5" />
          <rect x={x - 1.5} y={GROUND - h + 14} width={9} height={2} fill="rgba(56, 189, 248, 0.45)" />
        </g>
      ))}
      {TANKS.map(([cx, rx]) => (
        <g key={`k${cx}`} fill="#0B1233" stroke="rgba(56, 189, 248, 0.28)" strokeWidth="0.6">
          <rect x={cx - rx} y={GROUND - 30} width={rx * 2} height={30} />
          <ellipse cx={cx} cy={GROUND - 30} rx={rx} ry={5} />
        </g>
      ))}
      {/* Pipe racks linking the plant */}
      <path d={`M0 ${GROUND - 18} H640 M0 ${GROUND - 10} H640`} stroke="rgba(56, 189, 248, 0.22)" strokeWidth="1" />
      <g className="sky-lights">
        {WINDOWS.map((w, i) => (
          <rect
            key={i}
            x={w.x}
            y={w.y}
            width={3}
            height={3.5}
            fill={w.warm ? '#FBBF6A' : '#67E8F9'}
            className={w.twinkle ? 'sky-window twinkle' : 'sky-window'}
            style={w.twinkle ? ({ animationDelay: `${w.delay.toFixed(2)}s` } as CSSProperties) : undefined}
          />
        ))}
      </g>
    </>
  );

  return (
    <svg className="auth-skyline" viewBox="0 0 640 300" preserveAspectRatio="xMinYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky-tower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#111A44" />
          <stop offset="1" stopColor="#070B22" />
        </linearGradient>
        <linearGradient id="sky-horizon" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#22D3EE" stopOpacity="0.85" />
          <stop offset="0.6" stopColor="#8B5CF6" stopOpacity="0.5" />
          <stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sky-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sky-reflect" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="sky-mask-city"><rect width="640" height="300" fill="url(#sky-fade)" /></mask>
        <mask id="sky-mask-reflect">
          <rect y={GROUND} width="640" height={300 - GROUND} fill="url(#sky-reflect)" />
        </mask>
      </defs>
      <g mask="url(#sky-mask-city)">
        <g>{city}</g>
        {STACKS.map(([x, h], i) => (
          <circle key={`l${x}`} cx={x + 3} cy={GROUND - h - 2} r={2} fill="#F87171" className="sky-beacon" style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
        <g mask="url(#sky-mask-reflect)">
          <g transform={`translate(0 ${GROUND * 2}) scale(1 -1)`} opacity="0.55">{city}</g>
        </g>
        <rect x="0" y={GROUND - 0.5} width="640" height="1.2" fill="url(#sky-horizon)" className="sky-horizon" />
      </g>
    </svg>
  );
}

function GlobeOrbits() {
  const orbit = (rx: number, ry: number) => `M ${300 - rx} 300 a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
  const orbits = [
    { d: orbit(290, 92), rotate: -16, stroke: 'url(#orbit-violet)', dur: 14 },
    { d: orbit(270, 130), rotate: 22, stroke: 'url(#orbit-cyan)', dur: 18 },
    { d: orbit(300, 60), rotate: 6, stroke: 'url(#orbit-violet)', dur: 11 },
  ];
  return (
    <svg className="auth-orbits" viewBox="0 0 600 600" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="orbit-violet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C084FC" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#8B5CF6" stopOpacity="0.15" />
          <stop offset="1" stopColor="#A855F7" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="orbit-cyan" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22D3EE" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#22D3EE" stopOpacity="0.1" />
          <stop offset="1" stopColor="#38BDF8" stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id="orbit-packet">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.4" stopColor="#E9D5FF" />
          <stop offset="1" stopColor="#A855F7" stopOpacity="0" />
        </radialGradient>
      </defs>
      {orbits.map((o, i) => (
        <g key={i} transform={`rotate(${o.rotate} 300 300)`}>
          <path d={o.d} stroke={o.stroke} strokeWidth="1.1" className="orbit-path" />
          <circle r="5" fill="url(#orbit-packet)" className="orbit-packet">
            <animateMotion dur={`${o.dur}s`} repeatCount="indefinite" path={o.d} begin={`${-i * 3}s`} />
          </circle>
        </g>
      ))}
    </svg>
  );
}

/** Split-screen composition shared by sign-in, forgot-password, reset and first-login pages. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-visual" aria-label="About Project Atlas">
        <div className="auth-scene" aria-hidden="true">
          <div className="auth-aurora" />
          <div className="auth-stars" />
          <Skyline />
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className={`auth-particle${p.cyan ? ' cyan' : ''}`}
              style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDelay: `${-p.delay}s`, animationDuration: `${p.duration}s` }}
            />
          ))}
          <div className="auth-vignette" />
        </div>

        <div className="auth-visual-content">
          <p className="auth-eyebrow reveal" style={{ '--d': '0.05s' } as CSSProperties}>Janyutech Enterprise Portal</p>
          <h2 className="auth-hero-heading reveal" style={{ '--d': '0.15s' } as CSSProperties}>
            Every client project and monitoring dashboard, <span className="text-gradient">in one secure place.</span>
          </h2>
          <p className="auth-hero-desc reveal" style={{ '--d': '0.28s' } as CSSProperties}>
            Project Atlas brings Janyutech's industrial automation and monitoring projects together for authorised employees and approved client users.
          </p>
        </div>

        <figure className="auth-globe" aria-hidden="true">
          <div className="auth-globe-halo" />
          <img src="/brand/atlas-globe.webp" alt="" width={556} height={740} decoding="async" className="auth-globe-img" />
          <div className="auth-globe-scan" />
          <GlobeOrbits />
        </figure>

        <ul className="auth-features">
          {FEATURES.map(({ icon: Icon, title, text, tone }, i) => (
            <li key={title} className={`auth-feature reveal tone-${tone}`} style={{ '--d': `${0.45 + i * 0.12}s` } as CSSProperties}>
              <span className="auth-feature-icon" aria-hidden="true"><Icon size={24} strokeWidth={1.8} /></span>
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
            <span className="reveal" style={{ '--d': '0.25s' } as CSSProperties}><Logo size="lg" /></span>
            <h1 className="auth-title reveal" style={{ '--d': '0.35s' } as CSSProperties}>PROJECT ATLAS</h1>
            <p className="auth-subtitle reveal" style={{ '--d': '0.42s' } as CSSProperties}>{SUBTITLE}</p>
            <p className="auth-tagline reveal" style={{ '--d': '0.5s' } as CSSProperties}>{TAGLINE}</p>
            <span className="auth-divider" aria-hidden="true" />
          </div>

          <div className="auth-card-body reveal" style={{ '--d': '0.6s' } as CSSProperties}>{children}</div>

          <footer className="auth-foot">
            <span className="auth-secure">
              <Lock size={15} aria-hidden="true" /> Authorised personnel only. Access is logged.
            </span>
            <span>© {new Date().getFullYear()} Janyutech. All rights reserved.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
