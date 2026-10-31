import { useEffect, useRef } from 'react';

type Ribbon = {
  /** Centre line as a fraction of the height, for u (0..1 across the width) at time t. */
  center: (u: number, t: number) => number;
  /** Half-thickness as a fraction of the height. */
  spread: number;
  strands: number;
  twist: number;
  speed: number;
  alpha: number;
};

type Mote = { x: number; y: number; r: number; vx: number; vy: number; a: number; tw: number; ph: number };

const RIBBONS: Ribbon[] = [
  // Main wave: enters mid-left, dips towards the bottom and rises again on the right.
  { center: (u, t) => 0.6 + 0.2 * Math.sin(Math.PI * 1.05 * u - 0.15) + 0.02 * Math.sin(2 * Math.PI * u + t * 0.25), spread: 0.1, strands: 38, twist: 7.5, speed: 0.22, alpha: 0.85 },
  // Fainter band sweeping down from the top-left.
  { center: (u, t) => 0.2 + 0.58 * Math.sin((Math.PI / 2) * u) + 0.015 * Math.sin(3 * u + t * 0.3), spread: 0.07, strands: 22, twist: 5.5, speed: -0.17, alpha: 0.32 },
  // Low, wide floor of dots along the bottom edge.
  { center: (u, t) => 0.93 - 0.06 * u + 0.01 * Math.sin(4 * u - t * 0.2), spread: 0.06, strands: 16, twist: 4, speed: 0.12, alpha: 0.28 },
];

/** Frame shown when the user prefers reduced motion. */
const STILL_T = 6;

function makeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(220, 255, 250, 1)');
  grad.addColorStop(0.2, 'rgba(60, 235, 215, 0.75)');
  grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return c;
}

/**
 * Decorative teal particle wave for the sign-in branding: dotted ribbons that drift slowly plus a few
 * glowing motes. Plain canvas 2D, sized to its parent. Draws a single still frame for prefers-reduced-motion,
 * thins out and runs at 30 fps on small screens, and stops drawing while off-screen.
 */
export function ParticleWave({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sprite = makeSprite();
    let w = 0;
    let h = 0;
    let small = false;
    let motes: Mote[] = [];
    let raf = 0;
    let last = 0;
    let onScreen = true;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const step = small ? 8 : 5;
      const cols = Math.max(2, Math.round(w / step));
      const size = small ? 1.2 : 1.35;
      for (const r of RIBBONS) {
        const fill = ctx.createLinearGradient(0, 0, w, 0);
        fill.addColorStop(0, 'rgba(32, 227, 205, 0.15)');
        fill.addColorStop(0.3, 'rgba(40, 232, 210, 1)');
        fill.addColorStop(0.75, 'rgba(34, 211, 238, 0.9)');
        fill.addColorStop(1, 'rgba(34, 211, 238, 0.2)');
        ctx.fillStyle = fill;
        const strands = small ? Math.ceil(r.strands * 0.65) : r.strands;
        for (let j = 0; j < strands; j++) {
          const s = j / (strands - 1) - 0.5;
          // Stagger each strand's dots so neighbouring strands don't line up into vertical stripes.
          const offset = (j * 0.618034) % 1;
          ctx.globalAlpha = r.alpha * (0.2 + 0.8 * (1 - Math.abs(s) * 2));
          ctx.beginPath();
          for (let i = 0; i <= cols; i++) {
            const u = (i + offset) / cols;
            const spread = h * r.spread * Math.sin(u * r.twist + t * r.speed);
            const y = h * r.center(u, t) + s * 2 * spread + h * 0.012 * Math.sin(u * 9 + t * 0.6 + s * 4);
            ctx.rect(u * w, y, size, size);
          }
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      for (const m of motes) {
        const x = (((m.x + m.vx * t) % w) + w) % w;
        const y = (((m.y + m.vy * t) % h) + h) % h;
        const d = m.r * 7;
        ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(t * m.tw + m.ph));
        ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < (small ? 33 : 16)) return;
      last = now;
      draw(now / 1000);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (!w || !h) return;
      if (motion.matches) draw(STILL_T);
      else if (onScreen) raf = requestAnimationFrame(tick);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      small = w < 700;
      const count = Math.round(Math.min(48, (w * h) / 22000));
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 8,
        vy: -2 - Math.random() * 5,
        a: 0.35 + Math.random() * 0.55,
        tw: 0.4 + Math.random() * 1.2,
        ph: Math.random() * Math.PI * 2,
      }));
      start();
    };

    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(canvas);
    const viewObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      start();
    });
    viewObserver.observe(canvas);
    motion.addEventListener('change', start);

    return () => {
      cancelAnimationFrame(raf);
      sizeObserver.disconnect();
      viewObserver.disconnect();
      motion.removeEventListener('change', start);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
