import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Serverless bundles (Vercel) are read-only; only the OS temp directory is writable there. */
const defaultDataDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'atlas-data')
  : path.join(serverRoot, '..', 'data');

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const isProduction = process.env.NODE_ENV === 'production';
const isServerless = Boolean(process.env.VERCEL);

/** Minimum length of ATLAS_SESSION_SECRET outside local development. */
export const MIN_SESSION_SECRET_LENGTH = 32;

/** All runtime configuration comes from the environment. No secrets live in source. */
export const config = {
  isProduction,
  port: int('PORT', 4000),
  dataDir: path.resolve(process.env.ATLAS_DATA_DIR ?? defaultDataDir),
  /**
   * Hosted libSQL/Turso database. Required on serverless hosts, where each instance would otherwise
   * keep its own private copy of the data. Unset: a local SQLite file in dataDir.
   */
  database: {
    url: (process.env.ATLAS_DATABASE_URL || process.env.TURSO_DATABASE_URL || '').trim(),
    authToken: (process.env.ATLAS_DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '').trim() || undefined,
  },
  /** Public base URL of the portal, used to build password-reset links. */
  appUrl: (process.env.ATLAS_APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  /** Set to false only for local HTTP development. Defaults to true in production. */
  secureCookies: process.env.ATLAS_SECURE_COOKIES
    ? process.env.ATLAS_SECURE_COOKIES === 'true'
    : isProduction || isServerless, // Vercel is always served over HTTPS
  /** Trust X-Forwarded-* headers when deployed behind a reverse proxy. */
  trustProxy: process.env.ATLAS_TRUST_PROXY
    ? process.env.ATLAS_TRUST_PROXY === 'true'
    : isServerless, // Vercel's proxy sets X-Forwarded-For; needed for per-visitor rate limits and audit IPs
  session: {
    cookieName: 'atlas_session',
    ttlHours: int('ATLAS_SESSION_TTL_HOURS', 12),
    rememberDays: int('ATLAS_REMEMBER_DAYS', 30),
    /**
     * Signs session cookies. Never defaulted in source: production must set it (validateProductionConfig);
     * local development gets a random per-process secret, so restarting the dev server signs everyone out.
     */
    secret: process.env.ATLAS_SESSION_SECRET || crypto.randomBytes(48).toString('base64url'),
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
  /**
   * Upload guard: new uploads are refused once stored file contents reach this size, keeping the database
   * below the hosting plan's storage quota (Turso Free: 5 GB, shared with all other data).
   */
  storage: {
    limitBytes: int('ATLAS_STORAGE_LIMIT_MB', 4500) * 1024 * 1024,
  },
  /** Outbound reachability checks for dashboard links. */
  dashboardCheck: {
    enabled: process.env.ATLAS_DASHBOARD_CHECKS !== 'false',
    timeoutMs: int('ATLAS_DASHBOARD_CHECK_TIMEOUT_MS', 8000),
  },
};

/**
 * Refuse to start without the settings production depends on. Errors name the missing variables but
 * never echo their values.
 */
export function validateProductionConfig(options: { isServerless?: boolean } = {}) {
  const serverless = options.isServerless ?? isServerless;
  const errors: string[] = [];

  if (serverless) {
    if (!config.database.url) {
      errors.push('ATLAS_DATABASE_URL (or TURSO_DATABASE_URL) is not set. Serverless instances must share one hosted database.');
    } else if (!/^(libsql|https?|wss?):\/\//i.test(config.database.url)) {
      errors.push('ATLAS_DATABASE_URL must be a hosted database URL (libsql://…), not a local file.');
    } else if (/\.turso\.io/i.test(config.database.url) && !config.database.authToken) {
      errors.push('ATLAS_DATABASE_AUTH_TOKEN (or TURSO_AUTH_TOKEN) is not set for the Turso database.');
    }
  }

  if (config.isProduction || serverless) {
    const secret = process.env.ATLAS_SESSION_SECRET ?? '';
    if (secret.length < MIN_SESSION_SECRET_LENGTH) {
      errors.push(`ATLAS_SESSION_SECRET must be set to a random value of at least ${MIN_SESSION_SECRET_LENGTH} characters.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Production configuration error:\n- ${errors.join('\n- ')}`);
  }
}

export type Config = typeof config;

/** Where the database lives: the hosted URL when configured, otherwise `atlas.db` in the data directory. */
export const databaseTarget = () => {
  // Never fall back to an instance-local file on a serverless host: that silently splits the data.
  if (isServerless && !config.database.url) {
    throw new Error('ATLAS_DATABASE_URL (or TURSO_DATABASE_URL) is required on serverless hosts.');
  }
  return {
    url: config.database.url || path.join(config.dataDir, 'atlas.db'),
    authToken: config.database.authToken,
  };
};

