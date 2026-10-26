# Architecture

## Overview

```
Browser (React SPA)  ──HTTPS──▶  Express API (/api/*)  ──▶  SQLite (data/atlas.db)
        │                              │                     data/uploads/ (processed media)
        │                              └──▶ Mailer (dev outbox → SMTP in production)
        └── "Open Dashboard" ─▶ /api/dashboards/:id/open ─302─▶ external dashboard (Grafana, Power BI, SCADA web…)
```

The API and the built client are served by one Node process in production. The client never decides what a user may see: every list, detail, file and dashboard launch is filtered on the server.

Concerns are kept separate:

| Concern | Location |
| --- | --- |
| UI components & pages | `client/src/components`, `client/src/pages` |
| Authentication | `server/src/auth` (passwords, sessions, rate limit, middleware), `server/src/routes/auth.ts` |
| Authorisation | `server/src/services/permissions.ts` (single source of truth) |
| Project & client data | `server/src/routes/projects.ts`, `clients.ts`, `services/projects.ts` |
| File storage | `server/src/services/media.ts`, `routes/media.ts` |
| Dashboard URL management | `routes/projects.ts` (dashboard editor, open, verify), `services/urlSafety.ts` |
| Audit logging | `services/audit.ts`, `routes/overview.ts` (activity) |
| Configuration & secrets | `server/src/config.ts` reading environment variables only |

## Data model

| Table | Purpose |
| --- | --- |
| `users` | Accounts: role (`super_admin`, `project_admin`, `viewer`), optional client organisation, active flag, lockout counters |
| `sessions` | Server-side sessions; only a SHA-256 hash of the cookie token is stored |
| `password_tokens` | Single-use reset and invitation tokens (hashed, expiring) |
| `clients` | Client companies (one client → many projects), logo/cover, industry, website, location, placeholder flag |
| `categories` | Administrator-managed project categories with ordering |
| `projects` | Sections A–G of the project form: basic info, client link & location, media references, technical JSON, ownership/visibility/approval, lifecycle and maintenance, demo flag, archive state |
| `project_gallery` | Ordered gallery images with captions |
| `dashboards` | Multiple dashboards per project: name, URL, type, primary, open-in, provider, separate-login flag, thumbnail, verification result |
| `project_access` | Per-user project grants: `view`, `technical`, `manage` |
| `favorites`, `recent_access` | Per-user shortcuts and history |
| `media` | Uploaded files (random stored names), owning project/client, uploader |
| `audit_log` | Who did what and when (no secrets or dashboard content) |

`projects.technical` is a JSON object, so new technical metadata fields can be added from the form ("Additional fields") without a schema change. Schema changes go in `server/src/db/schema.ts` as new migration entries.

## Permission model

Implemented in `accessFor()` (`server/src/services/permissions.ts`):

| Who | Can view | Technical details | Manage |
| --- | --- | --- | --- |
| Super Admin | all projects | yes | yes, plus users, categories, deletes, public approval |
| Project Admin | granted / owned projects | on managed projects | projects they own or hold a `manage` grant on |
| Any user with `technical` grant | that project | yes | no |
| Any user with `view` grant | that project | no | no |
| All users of an "authorised role" (Restricted/Public projects) | yes | no | no |
| Users of the project's client company with client access on | yes | no | no |

- **Private** projects ignore role-wide and client-wide access: explicit grants only.
- **Archived** projects are hidden from everyone who cannot manage them.
- **Public Overview** requires a Super Admin, an explicit confirmation that the client authorised it, and approval status "Approved". Only summary fields are exposed at `GET /api/public/projects`; dashboards, media and technical data never are.

## API overview

All endpoints are under `/api`. Non-GET requests must send `X-Atlas-Request: 1`.

| Method & path | Who |
| --- | --- |
| `POST /auth/login`, `/auth/logout`, `/auth/forgot`, `/auth/reset/check`, `/auth/reset` | public (rate limited) |
| `GET /auth/me`, `/auth/sessions`; `POST /auth/change-password`, `/auth/sessions/revoke-others` | signed in |
| `GET /projects` (q, client, category, status, location, favorites, recent, sort), `GET /projects/:idOrSlug` | signed in, filtered |
| `POST /projects` | Super Admin |
| `PUT /projects/:id`, `POST /projects/:id/archive`, `/restore`, `GET/PUT /projects/:id/access` | managers |
| `DELETE /projects/:id` (archived only, typed confirmation) | Super Admin |
| `PUT /projects/:id/favorite`, `POST /projects/:id/viewed` | viewers of the project |
| `GET /dashboards/:id/open` (audited redirect), `POST /dashboards/:id/verify` | viewers / managers |
| `GET /clients`, `/clients/:key`; `POST/PUT /clients` | signed in; admins |
| `GET /categories`; `POST/PUT/DELETE /categories`, `PUT /categories/order` | signed in; Super Admin |
| `GET/POST/PUT /users…`, reset links, session revocation, per-user grants | Super Admin |
| `POST /media`, `GET /media/:id` | admins upload; reads are permission-checked |
| `GET /overview`, `/notifications`, `/activity`, `/resources` | signed in, filtered |
| `GET /public/projects` | public, approved summaries only |
