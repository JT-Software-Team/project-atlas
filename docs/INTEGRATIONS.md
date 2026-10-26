# Remaining integration work

Project Atlas is fully functional as delivered: real database, real authentication and authorisation, uploads, audit log and all administration screens. The items below need information or services that were not available while building it.

## Needs information from Janyutech

| Item | Status | What is needed |
| --- | --- | --- |
| Dashboard URLs for Gunny Ball, Anode Chipping and Aluminium Skimming | Not configured | The real `https://` links (and platform names) from the dashboard owners |
| Client for the Aluminium Skimming project | Placeholder "Client To Be Added" | Client company name, plus confirmation it may be shown |
| Client logos (JSW, Vedanta, …) | Initials shown | Official logo files and permission to use them |
| Project photos | Illustrations shown | Approved cover, plant, equipment and gallery images |
| Project descriptions, statuses, dates, locations | Demo text / sample statuses | Approved project details |
| Support contacts | Empty | Role mailboxes or team names that may be shown to users |
| Public overview policy | All projects restricted | Which projects (if any) clients have authorised for the public website |
| Hosting and domain | — | Where to host (VM, container platform) and the domain, e.g. `atlas.janyutech.com` |

## Needs a service or further development

1. **Email delivery** — reset and invitation emails are currently written to `data/outbox/` (`OutboxMailer` in `server/src/services/mailer.ts`). Implement the `Mailer` interface with your SMTP server or a transactional email API (e.g. via `nodemailer`), configured through environment variables. Until then, administrators can issue reset/invitation links from User Management.
2. **Single sign-on / MFA** (recommended for Janyutech staff) — integrate Microsoft Entra ID / Google Workspace via OIDC, or add TOTP-based MFA for administrators. The session layer (`server/src/auth/sessions.ts`) is independent of how the user proves identity, so an OIDC callback only needs to call `createSession`.
3. **Website integration** — add a link from the Janyutech website; optionally consume `GET /api/public/projects` for approved public summaries.
4. **Orphaned uploads cleanup** — files replaced or removed in forms stay on disk (unreferenced). Add a scheduled job that deletes `media` rows not referenced by any project, client, gallery or dashboard, plus their files.
5. **Dashboard availability monitoring** — only implement with authorised APIs or supported health endpoints from each dashboard provider. Keep it separate from project lifecycle status and never infer machine state from it.
6. **Secure dashboard embedding** — only where a provider explicitly supports it (e.g. signed embed URLs); would require adding the provider to the CSP `frame-src`.
7. **Notifications by email** — maintenance and review reminders are currently shown in the in-app bell. A daily job could email owners.
8. **Scaling** — PostgreSQL, object storage for uploads and a shared rate-limit store if running multiple instances (see DEPLOYMENT.md).
9. **Audit log export / retention policy** — decide retention and optionally forward to a SIEM.
10. **End-to-end test suite in CI** — API and component tests run with `npm test`; a Playwright suite can be added to CI once a repository and pipeline exist.
