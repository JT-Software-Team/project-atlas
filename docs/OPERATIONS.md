# Operating Project Atlas on free plans

How the live portal is hosted, what the free plans allow, how to watch usage, back up, and when (if ever) to pay.

## Services

| Service | Plan | Used for |
| --- | --- | --- |
| [Vercel](https://vercel.com) | Hobby (free) | Website and API (`api/index.js`, serverless) |
| [Turso](https://turso.tech) | Free | The database: all records **and** all uploaded files (`media_files` table) |

Nothing else is required. There are no paid analytics, monitoring or storage services.

### Free limits that matter (checked October 2026; re-check the official pages, they change)

**Turso Free** ([pricing](https://turso.tech/pricing)): no credit card, 5 GB total storage, 500 million rows read and 10 million rows written per month, 100 databases, 1-day point-in-time restore. With no card on file it cannot bill you; when a limit is reached the database is restricted until the next month or an upgrade (check the pricing page for the exact behaviour).

**Vercel Hobby** ([limits](https://vercel.com/docs/limits), [Hobby plan](https://vercel.com/docs/plans/hobby)): 1 million function invocations, 4 hours of active CPU and 100 GB fast data transfer per month. Hobby has no pay-as-you-go: over a limit, the project is paused until the next cycle or an upgrade. Function request bodies are limited to about 4.5 MB.

> **Commercial use.** Vercel's [fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines) restrict Hobby to *non-commercial, personal* use, and count any deployment that produces financial gain for anyone involved as commercial. A company portal for Janyutech is very likely commercial. Confirm with Vercel support or plan for Vercel Pro (paid, per seat). This is a licensing question, not a technical one: nothing in the code needs to change to move plans.

## Capacity (estimates; assumptions stated)

Every image is stored twice: a web copy (longest side ≤ 2000 px, WebP) and a thumbnail (≤ 720 px). Assumed average for a typical plant/equipment photo: **≈ 0.35 MB per image** including the thumbnail (range 0.1–0.6 MB). Logos are ≈ 0.01–0.03 MB. PDFs count at their full size.

| Uploads limit (`ATLAS_STORAGE_LIMIT_MB`) | Photos at 0.35 MB | Photos at 0.6 MB |
| --- | --- | --- |
| 4,500 MB (default; leaves ~0.5 GB of the 5 GB for records) | ~12,800 | ~7,500 |

Records are small: a project with dashboards, grants and audit history is a few KB, so 10,000 projects use well under 100 MB. Example: 500 projects × 10 photos ≈ 1.75 GB, about 40 % of the free storage.

Requests: images are served with versioned URLs and cached by browsers for 30 days, so repeat visits cost almost nothing. A first visit to the project directory makes a handful of API calls plus one call per visible thumbnail (24 per page step). For an internal portal with tens of users the Vercel and Turso request quotas are far from reach. Vercel's 4 active-CPU-hours are the tightest limit to watch, especially with many uploads (image processing is CPU-heavy).

## Monitoring

- **In the portal:** Settings → *Storage & usage* (Super Admin) shows stored file size against the upload limit, with warnings at 75 % and 90 %, and record counts.
- **Turso dashboard** (app.turso.tech → database → Usage): storage, rows read and written this month.
- **Vercel dashboard** (project → Usage): function invocations, active CPU and data transfer. Check notification settings so usage alerts reach you.
- When uploads reach the limit the portal refuses new files with a clear message; existing data keeps working.

Check both dashboards monthly, and whenever you upload many images at once.

## Backups (free)

Turso Free keeps only 1 day of point-in-time restore, so keep your own copies:

```bash
# in project-atlas/, with the production database in .env.hosted (ATLAS_DATABASE_URL, ATLAS_DATABASE_AUTH_TOKEN)
npm run backup          # → data/backups/atlas-<timestamp>.db  (all records and images)
```

Do this at least weekly and before large changes. Copy the file somewhere safe (e.g. a company drive). It is a normal SQLite file: open it with DB Browser for SQLite, or restore it:

```bash
# into a NEW, empty Turso database (ATLAS_DATABASE_URL pointing at it):
npm run migrate-to-hosted -- --source data/backups/atlas-<timestamp>.db           # dry run
npm run migrate-to-hosted -- --source data/backups/atlas-<timestamp>.db --apply
```

`data/` is excluded from git; never commit backups (they contain password hashes).

## Moving local data to the hosted database (one-time)

The local `data/atlas.db` and production are **separate**; nothing synchronises them.

1. Create the Turso database and put its URL and token in a local file `.env.hosted` (`ATLAS_DATABASE_URL=…`, `ATLAS_DATABASE_AUTH_TOKEN=…`). It is git-ignored and read only by `migrate-to-hosted` and `backup`; keep them out of `.env`, or `npm run dev` would work on the production database.
2. Dry run: `npm run migrate-to-hosted`. Review the counts and the list of active Super Admins.
3. Apply, disabling accounts whose passwords were ever default, shared or unknown:
   `npm run migrate-to-hosted -- --apply --disable-user admin@atlas --disable-user admin@atlas.local`
   This first copies `data/atlas.db` and `data/uploads/` to `data/backups/pre-migration-<timestamp>/`, then copies every record with its original ID, imports the files from `data/uploads/`, verifies counts and references, and commits only if everything checks out. Sessions and reset links are not copied.
4. Only then deploy with the same database URL. The target must be empty, so do this **before** the first deployment (which would otherwise seed demo data); if it is not, create a fresh database.

Local files are never modified or deleted.

## Day to day

- **Add a client:** Clients → Add client (logo optional). Clients can have any number of projects.
- **Add a project:** All Projects → Add project. Fill in client, category, status, description, images (cover, plant, equipment, gallery, PDF), location, technical notes and any number of dashboard links. Everything is stored in the database; no code changes are needed.
- **Access:** set visibility and authorised roles on the project, grant individual users access from the project's access panel or User Management. Client users only see projects they are granted or that allow their client.
- **Archive / delete:** archive first; a Super Admin can then delete permanently, which also deletes the project's images.
- **Images:** prefer JPG/PNG/WebP photos; anything above ~4 MB is shrunk in the browser first. Replacing or removing an image deletes the old file, so storage does not fill with unused copies. Uploads never saved to a record are removed after a day.

## Reducing usage

- Upload one good cover per project rather than many near-duplicates; use the gallery for the rest.
- Avoid scanned PDFs of hundreds of pages; link large documents from the project's documentation URL instead.
- Delete projects that are truly obsolete (archive keeps their images).
- The audit log grows with every action (a few hundred bytes each); it only matters after millions of events.

## When to pay (and what it costs)

Move only when a dashboard shows you approaching a limit, or for the Vercel commercial-use terms. **Each of these incurs charges; check current prices first:**

- **Vercel Pro** (per seat/month): commercial use allowed, higher function limits.
- **Turso Developer** (paid): more storage and row quotas, longer point-in-time restore. Same database, no migration.
- **Object storage for images** (e.g. Cloudflare R2: 10 GB free, but requires a payment method on the account; Vercel Blob: 1 GB on Hobby). Only worth it if images outgrow the database plan; it requires moving `media_files` contents and changing `server/src/services/media.ts`.
- **Leaving Vercel entirely:** the Docker image (see DEPLOYMENT.md, Option B) runs anywhere with a persistent disk, using a local SQLite file. Export with `npm run backup` and use the backup file as `atlas.db`.
