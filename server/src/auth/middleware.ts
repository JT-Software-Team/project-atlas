import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import type { DB } from '../db/index.js';
import { HttpError } from '../http.js';
import { loadSession } from './sessions.js';
import type { Role } from './types.js';

export function sessionMiddleware(db: DB) {
  return (req: Request, _res: Response, next: NextFunction) => {
    loadSession(db, req.cookies?.[config.session.cookieName]).then((session) => {
      if (session) {
        req.user = session.user;
        req.sessionTokenHash = session.tokenHash;
      }
      next();
    }, next);
  };
}

/**
 * CSRF defence: state-changing requests must carry a custom header. Browsers
 * cannot send it cross-origin without a CORS preflight, which this API never grants.
 */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-atlas-request') !== '1') return next(new HttpError(403, 'Missing request verification header.'));
  next();
}

/** Routes a user may still reach while their initial password is awaiting replacement. */
const PASSWORD_CHANGE_ALLOWED = new Set(['/auth/me', '/auth/logout', '/auth/change-password']);

/** Accounts flagged for a password change can do nothing else until they choose a new one. */
export function requirePasswordChange(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.path)) {
    return next(new HttpError(403, 'Please choose a new password before continuing.'));
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission to do that.'));
    next();
  };
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
  if (req.user.role !== 'super_admin') return next(new HttpError(403, 'Only a Super Admin can perform this action.'));
  next();
}
