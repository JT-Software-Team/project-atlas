# Security

This document describes the security controls implemented in Project Atlas and what must be in place before go-live.

## Authentication

- Passwords are hashed with **scrypt** (N=2^15, r=8, p=1, 16-byte salt). Plain-text passwords are never stored or logged, and there are no hard-coded credentials anywhere in the source.
- The first Super Admin is created with `npm run create-admin`. Other users are **invited**: the administrator never chooses or sees their password; the user sets it through a single-use link (72 h).
- Password policy: at least 10 characters and three of lowercase / uppercase / digits / symbols.
- Sessions are random 256-bit tokens in an **httpOnly, SameSite=Lax, Secure** cookie. The database stores only a SHA-256 hash, so a database leak does not expose live sessions. Sessions expire after 12 hours (30 days with "Keep me signed in"), and can be revoked by the user or an administrator.
- **Login protection**: 20 attempts per IP per 15 minutes, and accounts lock for 15 minutes after 5 consecutive failures. Error messages do not reveal whether an email exists; the forgot-password flow always gives the same answer.
- **Password reset** tokens are single-use, expire after 60 minutes, are stored hashed, and are placed in the URL fragment (`#token=`) so they are not sent to servers or leaked through the Referer header. Completing a reset signs the user out everywhere.
- Changing a role, disabling an account or resetting a password revokes that user's sessions immediately.

## Authorisation

- Every API route checks the session; every project, file and dashboard operation runs through `accessFor()` in `server/src/services/permissions.ts`.
- Lists, search, facets, overview statistics, the activity feed and resources are filtered server-side; hidden projects never reach the browser. Technical fields are only searchable by users allowed to see them.
- Dashboard URLs are only sent to project managers. Viewers launch dashboards through `/api/dashboards/:id/open`, which re-checks access, records the event and redirects with `Referrer-Policy: no-referrer`.
- Client-side route guards exist only for usability.

## Request & response hardening

- CSRF: all state-changing requests require the `X-Atlas-Request: 1` header (which browsers cannot send cross-site without a CORS preflight that this API never approves) in addition to SameSite cookies.
- Helmet sets a strict Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`), HSTS, `nosniff`, and other headers. API responses are `Cache-Control: no-store`.
- Inputs are validated with Zod on the server (types, lengths, enums, dates).

## Uploads

- Only JPG/PNG/WebP/GIF/AVIF images and PDF documents. Type is detected from file **content**, not the extension. SVG is rejected (script risk).
- Images are re-encoded to WebP with `sharp`, which strips metadata and embedded payloads, resized to 2000 px max, with a 720 px thumbnail.
- Files are stored under random names outside the web root and served only through `/api/media/:id` after a permission check, with `nosniff` and a sandboxing CSP.

## Dashboard links

- Only `https://` URLs (http can be enabled explicitly via env), no embedded usernames/passwords and no `token=`/`password=`-style query parameters.
- External dashboards are opened directly; Project Atlas does not embed, proxy, scrape or log in to them.
- "Verify link" sends a credential-free HEAD/GET to the host, never follows redirects, refuses private/internal IP ranges by default (SSRF protection), and records only the HTTP status. A response only proves the web server answered; it is never presented as machine or plant health.

## Audit log

Sign-ins, failed sign-ins, password events, user changes, role changes, access grants/revocations, project create/update/status/visibility/archive/restore/delete, dashboard add/remove/URL change/verify/open, client and category changes are recorded with timestamp, user and IP. Passwords, tokens and dashboard content are never written to the log.

## Go-live checklist

- [ ] Serve only over HTTPS; keep `ATLAS_SECURE_COOKIES=true`; set `ATLAS_TRUST_PROXY=true` behind a proxy so rate limiting sees real client IPs.
- [ ] Configure a real email transport (see INTEGRATIONS.md) so reset and invitation emails are delivered.
- [ ] Create named Super Admin accounts; delete or disable any `--demo-users` accounts.
- [ ] Restrict file-system access to `ATLAS_DATA_DIR` and back it up (database + uploads), encrypted at rest.
- [ ] Review the activity log regularly; consider exporting it to your SIEM.
- [ ] If running more than one server instance, move rate limiting to a shared store and the database to PostgreSQL.
- [ ] Consider adding MFA / SSO (see INTEGRATIONS.md) for administrator accounts.
- [ ] Run a penetration test before exposing the portal to client users.
