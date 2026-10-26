import { nowIso, type DB } from '../db/index.js';
import { isLoginId } from './loginId.js';
import { hashPassword, passwordProblems } from './passwords.js';
import { revokeUserSessions } from './sessions.js';

export interface SuperAdminInput {
  loginId: string;
  name: string;
  password: string;
  /** Replace the password and role of an existing account with this login ID. Off by default. */
  reset?: boolean;
}

export type ProvisionResult = 'created' | 'updated' | 'exists';

/**
 * Create the initial Super Admin. The password is stored only as a scrypt hash and
 * must be changed at first sign-in. Existing accounts are left untouched unless `reset` is set.
 */
export async function provisionSuperAdmin(db: DB, input: SuperAdminInput, minPasswordLength: number): Promise<ProvisionResult> {
  const loginId = input.loginId.trim().toLowerCase();
  const name = input.name.trim();
  if (!isLoginId(loginId)) throw new Error('A valid email address or user ID (e.g. name@realm) is required.');
  if (!name) throw new Error('A name is required.');
  const problem = passwordProblems(input.password, minPasswordLength);
  if (problem) throw new Error(problem);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(loginId) as { id: number } | undefined;
  if (existing && !input.reset) return 'exists';

  const hash = await hashPassword(input.password);
  if (existing) {
    db.prepare(`UPDATE users SET name = ?, role = 'super_admin', password_hash = ?, must_change_password = 1, is_active = 1,
                failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`)
      .run(name, hash, nowIso(), existing.id);
    revokeUserSessions(db, existing.id);
    return 'updated';
  }
  db.prepare(`INSERT INTO users (email, name, role, password_hash, must_change_password, created_at, updated_at)
              VALUES (?, ?, 'super_admin', ?, 1, ?, ?)`)
    .run(loginId, name, hash, nowIso(), nowIso());
  return 'created';
}
