import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import type { DB } from '../db/index.js';
import { HttpError } from '../http.js';
import { loadSession } from './sessions.js';
import type { Role } from './types.js';

export function sessionMiddleware(db: DB) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const session = loadSession(db, req.cookies?.[config.session.cookieName]);
    if (session) {
      req.user = session.user;
      req.sessionTokenHash = session.tokenHash;
    }
    next();
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
