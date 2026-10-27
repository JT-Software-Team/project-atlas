# Deployment

## Option A — Node.js on a server/VM

```bash
git clone <repo> project-atlas && cd project-atlas
npm ci
cp .env.example .env        # edit values: ATLAS_APP_URL, ATLAS_DATA_DIR, etc.
npm run build
npm run create-admin
npm start                   # listens on PORT (default 4000)
```

Run it under a process manager (systemd, pm2) so it restarts automatically. Example systemd unit:

```ini
[Unit]
Description=Project Atlas
After=network.target

[Service]
WorkingDirectory=/opt/project-atlas
ExecStart=/usr/bin/npm start
Restart=always
User=atlas
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Option B — Docker

```bash
docker build -t project-atlas .
docker run -d --name atlas -p 4000:4000 -v atlas-data:/data \
  -e ATLAS_APP_URL=https://atlas.example.com -e ATLAS_TRUST_PROXY=true project-atlas
docker exec -it atlas node server/dist/scripts/createAdmin.js   # or set ATLAS_ADMIN_* env and run once
```

## Option C — Vercel

`api/index.js` runs the API as a serverless function. Vercel starts several short-lived instances at once and routes each request to any of them, so the data **must** live in a hosted database that all instances share. Project Atlas uses [Turso](https://turso.tech) (hosted libSQL, SQLite-compatible): the same schema and queries, plus the uploaded images and documents, which are stored in the database.

1. Create a Turso database, either through the Vercel Marketplace (Project → Storage → Turso, which sets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for you) or with the Turso CLI:
   ```
   turso db create project-atlas
   turso db show project-atlas --url        # libsql://project-atlas-<org>.turso.io
   turso db tokens create project-atlas
   ```
2. In Project → Settings → Environment Variables, set (if the Marketplace did not):
   ```
   ATLAS_DATABASE_URL=libsql://project-atlas-<org>.turso.io
   ATLAS_DATABASE_AUTH_TOKEN=<token>
   ```
3. Also set `ATLAS_SESSION_SECRET` (random, at least 32 characters) and, for the first Super Admin, `ATLAS_ADMIN_EMAIL`, `ATLAS_ADMIN_NAME` and `ATLAS_ADMIN_PASSWORD`. Set every variable for the **Production** environment (and Preview, if preview deployments should work).
4. To keep existing local data, copy it into the new database **before the first deployment** (see "Moving local data to the hosted database" in [OPERATIONS.md](OPERATIONS.md)). Otherwise the first request creates the schema, the default categories and the demo projects.
5. Deploy.

The function refuses to start (HTTP 503 with a generic message; details in the function logs) when the database URL, its token or the session secret is missing. It never falls back to an instance-local database.

The Super Admin from `ATLAS_ADMIN_*` is created only if that account does not exist; an existing account and any password changed in the portal are left alone. To recover access, set `ATLAS_ADMIN_RESET=true` for one deployment, sign in, then remove it. There is no built-in default account or password.

Vercel limits request bodies to about 4.5 MB. The browser shrinks large photos before uploading; PDFs must be under that size.

## Reverse proxy (HTTPS)

Terminate TLS in Nginx, Caddy, or your cloud load balancer and forward to port 4000. Nginx example:

```nginx
server {
  listen 443 ssl http2;
  server_name atlas.example.com;
  # ssl_certificate ...; ssl_certificate_key ...;
  client_max_body_size 25m;          # uploads up to 20 MB
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Set `ATLAS_TRUST_PROXY=true` so the server sees real client IPs for rate limiting and the audit log.

## Linking from the Janyutech website

The portal is a separate application. The simplest integration is a "Client Portal / Project Atlas" link on the company website pointing to e.g. `https://atlas.janyutech.com`. If the site should list non-confidential projects publicly, it can read `GET https://atlas.../api/public/projects`, which returns only projects a Super Admin approved for public overview. Hosting under the same parent domain (sub-domain) keeps cookies isolated from the main site.

## Backups

- **Hosted database (Vercel):** `npm run backup` (with `ATLAS_DATABASE_URL`/`ATLAS_DATABASE_AUTH_TOKEN` set locally) exports every record and uploaded file to `data/backups/atlas-<timestamp>.db`. See [OPERATIONS.md](OPERATIONS.md).
- **Local/Docker:** everything stateful lives in `ATLAS_DATA_DIR`: `atlas.db` (+ `-wal`/`-shm`) and, for files uploaded before they were stored in the database, `uploads/`. `npm run backup` works here too, or use `sqlite3 atlas.db ".backup backup.db"`.

Keep backups somewhere other than the machine they came from, and test a restore occasionally.

## Scaling notes

SQLite comfortably serves a portal of this kind (hundreds of users, thousands of projects) on one instance. For multiple instances or high availability, migrate to PostgreSQL (the SQL is standard; the data layer is concentrated in `server/src/routes` and `server/src/services`), move uploads to object storage (S3/Azure Blob) and the rate limiter to Redis.
