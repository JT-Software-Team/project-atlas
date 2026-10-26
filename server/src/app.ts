import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { requireCsrfHeader, requirePasswordChange, sessionMiddleware } from './auth/middleware.js';
import './auth/types.js';
import { config } from './config.js';
import type { DB } from './db/index.js';
import { errorHandler, HttpError } from './http.js';
import { authRoutes } from './routes/auth.js';
import { categoryRoutes } from './routes/categories.js';
import { clientRoutes } from './routes/clients.js';
import { mediaRoutes } from './routes/media.js';
import { overviewRoutes } from './routes/overview.js';
import { dashboardRoutes, projectRoutes } from './routes/projects.js';
import { publicRoutes } from './routes/public.js';
import { userRoutes } from './routes/users.js';
import type { Mailer } from './services/mailer.js';

export interface AppOptions {
  db: DB;
  mailer: Mailer;
  /** Directory of the built client to serve (production). */
  staticDir?: string;
}

export function createApp({ db, mailer, staticDir }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.secureCookies ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'same-origin' },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/public', publicRoutes(db));
  api.use(sessionMiddleware(db));
  api.use(requireCsrfHeader);
  api.use(requirePasswordChange);
  api.use('/auth', authRoutes(db, mailer));
  api.use('/projects', projectRoutes(db));
  api.use('/dashboards', dashboardRoutes(db));
  api.use('/clients', clientRoutes(db));
  api.use('/categories', categoryRoutes(db));
  api.use('/users', userRoutes(db, mailer));
  api.use('/media', mediaRoutes(db));
  api.use('/', overviewRoutes(db));
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found.')));
  app.use('/api', api);

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    // Single-page app fallback. Route protection is enforced by the API, not by hiding pages.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
