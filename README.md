# Project Atlas by Janyutech

**Industrial Intelligence & Monitoring Portal** — *One Platform. Every Project. Complete Visibility.*

Project Atlas is a secure, central portal where authorised Janyutech employees and approved client users find industrial project information and open each project's monitoring dashboards. It is a standalone application designed to be linked from, or later integrated with, the Janyutech company website.

> Project Atlas is a **directory and access layer** for existing dashboards. It does not collect or display industrial telemetry, and it never reports a machine as online or offline.

## What's included

| Area | Highlights |
| --- | --- |
| Sign-in | Login page with the official Janyutech logo, validation, show/hide password, remember-me (server-side, revocable), forgot/reset password, invitation acceptance |
| Security | scrypt password hashing, httpOnly session cookies, CSRF header check, login rate limiting + account lockout, role & per-project permissions enforced on every API call, audit log, strict security headers, safe uploads |
| Overview | Statistics computed only from stored records, recent projects, recently accessed, recent activity, maintenance/review notifications |
| Directory | Search (name, client, description, category, location, tags, technical fields when authorised), filters, sorting, favorites, recently accessed |
| Project pages | Reusable details template: cover, client, dashboards with Open Dashboard actions, gallery, technical/maintenance info by permission, documents, contacts |
| Administration | Sectioned add/edit form (A–G) with live card preview, multi-dashboard editor (reorder, primary, verify link), media uploads with preview, client & category management, archive/restore/delete, user invitations, roles, project grants, disabling accounts, session revocation, audit log |
| Data | SQLite database (Node's built-in driver) with versioned migrations; all project content comes from the database, nothing is hard-coded |

## Quick start (local)

Requirements: **Node.js 22.13+** (uses the built-in `node:sqlite` module).

```bash
npm install
cp .env.example .env            # then set ATLAS_SECURE_COOKIES=false and ATLAS_APP_URL=http://localhost:5173 for local HTTP
npm run create-admin            # create your Super Admin (prompts for email or user ID, name, password; must be changed at first sign-in)
npm run seed                    # optional: default categories + the 3 demo projects
npm run seed -- --demo-users    # optional: also 3 demo accounts with random passwords, printed once
npm run dev                     # API on :4000, web app on http://localhost:5173
```

Run the checks:

```bash
npm test          # API tests (auth, permissions, uploads, validation) + UI component tests
npm run typecheck
npm run build     # production build of client and server
npm start         # serves the API and built client on PORT (default 4000)
```

## Repository layout

```
client/                 React + TypeScript + Vite single-page app
  public/brand/         Official Janyutech logo (replace here)
  public/placeholders/  Industrial illustrations used when a project has no cover image
  src/auth/             Session context and route guards (UX only — the API enforces access)
  src/components/       Layout, project card, uploads, shared UI states
  src/pages/            Login, overview, directory, details, clients, categories, resources, profile
  src/pages/admin/      Project management, project form, users, settings
  src/styles/           Design tokens and styles (Dark Purple / Blue Cyber theme)
server/                 Express + TypeScript API
  src/auth/             Password hashing, sessions, rate limiting, middleware
  src/db/               SQLite connection and migrations
  src/routes/           auth, projects, dashboards, clients, categories, users, media, overview, public
  src/services/         Permissions, project serialisation, audit, media processing, URL safety, mailer
  src/scripts/          create-admin, seed and demo data
  src/test/             API tests
docs/                   Architecture, security, deployment, content guide, remaining integrations
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data model, permission model, API overview
- [docs/SECURITY.md](docs/SECURITY.md) — how authentication and authorisation work, hardening checklist
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production setup, Docker, reverse proxy, backups
- [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) — replacing the logo, adding real clients, images and dashboard links
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — remaining integration work and open questions

## Demo data

The three sample projects (JSW — Gunny Ball, Vedanta — Anode Chipping, Aluminium Skimming with client to be added) are flagged as **demo data** throughout the UI. Their statuses are sample values, they have no dashboard links, and their images are placeholder illustrations. Replace or delete them in **Project Management** — no code changes are needed.
