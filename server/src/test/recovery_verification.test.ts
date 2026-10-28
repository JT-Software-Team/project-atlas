import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../auth/passwords.js';
import { login, PASSWORD, setup } from './helpers.js';

describe('recovery email verification workflow', () => {
  it('rejects unauthenticated verification requests', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/auth/recovery-email/request-verification').set('x-atlas-request', '1');
    expect(res.status).toBe(401);
  });

  it('rejects verification request from non-super-admins', async () => {
    const { app, db, ids } = await setup();
    await db.prepare('UPDATE users SET recovery_email = ? WHERE id = ?').run('viewer-rec@example.com', ids.viewer);
    const viewer = await login(app, 'viewer@test.local');
    const res = await viewer.post('/api/auth/recovery-email/request-verification');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only a Super Admin/i);
  });

  it('rejects request if no recovery email is configured', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');
    const res = await admin.post('/api/auth/recovery-email/request-verification');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No recovery email address is configured/i);
  });

  it('issues a single-use verification token and queues email', async () => {
    const { app, db, ids, mailer } = await setup();
    await db.prepare('UPDATE users SET recovery_email = ?, recovery_email_verified = 0 WHERE id = ?')
      .run('ps7379806924@gmail.com', ids.admin);

    const admin = await login(app, 'admin@test.local');
    const res = await admin.post('/api/auth/recovery-email/request-verification');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toContain('ps7379806924@gmail.com');
    expect(res.body.token).toBeUndefined(); // Token never exposed in API response

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('ps7379806924@gmail.com');
    expect(mailer.sent[0].subject).toContain('Verify your Project Atlas recovery email');

    const tokenMatch = mailer.sent[0].text.match(/#token=([\w-]+)/);
    expect(tokenMatch).not.toBeNull();
    const rawToken = tokenMatch![1];
    expect(rawToken.length).toBeGreaterThanOrEqual(40); // 32 bytes in base64url is 43 chars

    // Database only holds SHA-256 hash
    const tokenRow = await db.prepare('SELECT token_hash, user_id, email, used_at FROM email_verification_tokens WHERE token_hash = ?')
      .get(sha256(rawToken)) as { token_hash: string; user_id: number; email: string; used_at: string | null };
    expect(tokenRow).toBeDefined();
    expect(tokenRow.user_id).toBe(ids.admin);
    expect(tokenRow.email).toBe('ps7379806924@gmail.com');
    expect(tokenRow.used_at).toBeNull();
  });

  it('verifies token, flips recovery_email_verified, and preserves password hash byte-for-byte', async () => {
    const { app, db, ids, mailer } = await setup();
    await db.prepare('UPDATE users SET recovery_email = ?, recovery_email_verified = 0 WHERE id = ?')
      .run('ps7379806924@gmail.com', ids.admin);

    const userBefore = await db.prepare('SELECT id, email, password_hash, role FROM users WHERE id = ?').get(ids.admin) as {
      id: number; email: string; password_hash: string; role: string;
    };

    const admin = await login(app, 'admin@test.local');
    await admin.post('/api/auth/recovery-email/request-verification');

    const rawToken = mailer.sent[0].text.match(/#token=([\w-]+)/)![1];

    // Check token endpoint
    const checkRes = await request(app).post('/api/auth/recovery-email/check').set('x-atlas-request', '1').send({ token: rawToken });
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.email).toBe('ps7379806924@gmail.com');

    // Complete verification
    const verifyRes = await request(app).post('/api/auth/recovery-email/verify').set('x-atlas-request', '1').send({ token: rawToken });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.ok).toBe(true);

    const userAfter = await db.prepare(
      'SELECT id, email, password_hash, role, recovery_email, recovery_email_verified FROM users WHERE id = ?'
    ).get(ids.admin) as {
      id: number; email: string; password_hash: string; role: string; recovery_email: string; recovery_email_verified: number;
    };

    expect(userAfter.id).toBe(userBefore.id);
    expect(userAfter.email).toBe(userBefore.email);
    expect(userAfter.role).toBe(userBefore.role);
    expect(userAfter.password_hash).toBe(userBefore.password_hash); // Byte-for-byte preserved
    expect(userAfter.recovery_email).toBe('ps7379806924@gmail.com');
    expect(userAfter.recovery_email_verified).toBe(1); // Verified!

    // /me reflects verified status
    const meRes = await admin.get('/api/auth/me');
    expect(meRes.body.user.recoveryEmail).toBe('ps7379806924@gmail.com');
    expect(meRes.body.user.recoveryEmailVerified).toBe(true);

    // Existing password still works for sign in
    await admin.post('/api/auth/logout');
    await login(app, 'admin@test.local', PASSWORD);
  });

  it('rejects token reuse (single-use guarantee)', async () => {
    const { app, db, ids, mailer } = await setup();
    await db.prepare('UPDATE users SET recovery_email = ?, recovery_email_verified = 0 WHERE id = ?')
      .run('ps7379806924@gmail.com', ids.admin);

    const admin = await login(app, 'admin@test.local');
    await admin.post('/api/auth/recovery-email/request-verification');
    const rawToken = mailer.sent[0].text.match(/#token=([\w-]+)/)![1];

    const first = await request(app).post('/api/auth/recovery-email/verify').set('x-atlas-request', '1').send({ token: rawToken });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/auth/recovery-email/verify').set('x-atlas-request', '1').send({ token: rawToken });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/invalid or has expired/i);
  });

  it('rejects expired tokens', async () => {
    const { app, db, ids, mailer } = await setup();
    await db.prepare('UPDATE users SET recovery_email = ?, recovery_email_verified = 0 WHERE id = ?')
      .run('ps7379806924@gmail.com', ids.admin);

    const admin = await login(app, 'admin@test.local');
    await admin.post('/api/auth/recovery-email/request-verification');
    const rawToken = mailer.sent[0].text.match(/#token=([\w-]+)/)![1];

    // Force expiration in database
    await db.prepare('UPDATE email_verification_tokens SET expires_at = ? WHERE token_hash = ?')
      .run('2020-01-01T00:00:00.000Z', sha256(rawToken));

    const checkRes = await request(app).post('/api/auth/recovery-email/check').set('x-atlas-request', '1').send({ token: rawToken });
    expect(checkRes.status).toBe(400);
    expect(checkRes.body.error).toMatch(/invalid or has expired/i);

    const verifyRes = await request(app).post('/api/auth/recovery-email/verify').set('x-atlas-request', '1').send({ token: rawToken });
    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.error).toMatch(/invalid or has expired/i);
  });

  it('rejects tampered or malformed tokens', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/auth/recovery-email/verify').set('x-atlas-request', '1')
      .send({ token: 'nonexistent-token-deadbeefdeadbeef' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or has expired/i);
  });

  it('re-requesting verification invalidates older tokens for that user', async () => {
    const { app, db, ids, mailer } = await setup();
    await db.prepare('UPDATE users SET recovery_email = ?, recovery_email_verified = 0 WHERE id = ?')
      .run('ps7379806924@gmail.com', ids.admin);

    const admin = await login(app, 'admin@test.local');
    await admin.post('/api/auth/recovery-email/request-verification');
    const token1 = mailer.sent[0].text.match(/#token=([\w-]+)/)![1];

    await admin.post('/api/auth/recovery-email/request-verification');
    const token2 = mailer.sent[1].text.match(/#token=([\w-]+)/)![1];

    // Older token1 must now be rejected
    const res1 = await request(app).post('/api/auth/recovery-email/verify').set('x-atlas-request', '1').send({ token: token1 });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toMatch(/invalid or has expired/i);

    // Newer token2 succeeds
    const res2 = await request(app).post('/api/auth/recovery-email/verify').set('x-atlas-request', '1').send({ token: token2 });
    expect(res2.status).toBe(200);
  });
});
