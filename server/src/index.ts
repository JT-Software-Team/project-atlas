import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { OutboxMailer } from './services/mailer.js';
import { ensureReferenceData } from './scripts/referenceData.js';

const db = openDatabase(path.join(config.dataDir, 'atlas.db'));
ensureReferenceData(db);

const staticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
const app = createApp({ db, mailer: new OutboxMailer(), staticDir });

const { n } = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND is_active = 1`).get() as { n: number };
app.listen(config.port, () => {
  console.info(`Project Atlas API listening on http://localhost:${config.port}`);
  if (n === 0) console.warn('No Super Admin exists yet. Run `npm run create-admin` to create one.');
  if (!config.secureCookies) console.warn('Secure cookies are OFF. Only acceptable for local development over HTTP.');
});
