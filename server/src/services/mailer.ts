import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development mailer: writes messages to data/outbox instead of sending them.
 * Replace with a real transport (SMTP / transactional email API) in production —
 * see docs/INTEGRATIONS.md.
 */
export class OutboxMailer implements Mailer {
  async send(message: MailMessage) {
    const dir = path.join(config.dataDir, 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${message.to.replace(/[^a-z0-9@.]/gi, '_')}.txt`);
    fs.writeFileSync(file, `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`, { mode: 0o600 });
    if (!config.isProduction) console.info(`[mail] Message for ${message.to} written to ${file}`);
  }
}

export class MemoryMailer implements Mailer {
  sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
}
