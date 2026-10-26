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

Everything stateful lives in `ATLAS_DATA_DIR`:

- `atlas.db` (+ `-wal`/`-shm`) — the database. Use `sqlite3 atlas.db ".backup backup.db"` or stop the service before copying.
- `uploads/` — processed images and PDFs.

Schedule daily encrypted backups and test restores.

## Scaling notes

SQLite comfortably serves a portal of this kind (hundreds of users, thousands of projects) on one instance. For multiple instances or high availability, migrate to PostgreSQL (the SQL is standard; the data layer is concentrated in `server/src/routes` and `server/src/services`), move uploads to object storage (S3/Azure Blob) and the rate limiter to Redis.
