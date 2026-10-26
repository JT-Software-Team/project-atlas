import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const isProduction = process.env.NODE_ENV === 'production';

/** All runtime configuration comes from the environment. No secrets live in source. */
export const config = {
  isProduction,
  port: int('PORT', 4000),
  dataDir: path.resolve(process.env.ATLAS_DATA_DIR ?? path.join(serverRoot, '..', 'data')),
  /** Public base URL of the portal, used to build password-reset links. */
  appUrl: (process.env.ATLAS_APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  /** Set to false only for local HTTP development. Defaults to true in production. */
  secureCookies: process.env.ATLAS_SECURE_COOKIES
    ? process.env.ATLAS_SECURE_COOKIES === 'true'
    : isProduction,
  /** Trust X-Forwarded-* headers when deployed behind a reverse proxy. */
  trustProxy: process.env.ATLAS_TRUST_PROXY === 'true',
  session: {
    cookieName: 'atlas_session',
    ttlHours: int('ATLAS_SESSION_TTL_HOURS', 12),
    rememberDays: int('ATLAS_REMEMBER_DAYS', 30),
  },
  auth: {
    maxFailedAttempts: int('ATLAS_MAX_FAILED_LOGINS', 5),
    lockoutMinutes: int('ATLAS_LOCKOUT_MINUTES', 15),
    resetTokenMinutes: int('ATLAS_RESET_TOKEN_MINUTES', 60),
    inviteTokenHours: int('ATLAS_INVITE_TOKEN_HOURS', 72),
    minPasswordLength: 10,
  },
  uploads: {
    maxImageBytes: int('ATLAS_MAX_IMAGE_MB', 8) * 1024 * 1024,
    maxDocumentBytes: int('ATLAS_MAX_DOCUMENT_MB', 20) * 1024 * 1024,
  },
  /** Outbound reachability checks for dashboard links. */
  dashboardCheck: {
    enabled: process.env.ATLAS_DASHBOARD_CHECKS !== 'false',
    timeoutMs: int('ATLAS_DASHBOARD_CHECK_TIMEOUT_MS', 8000),
  },
};

export type Config = typeof config;
