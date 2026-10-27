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
  /** Force the user to change password at next sign-in. Defaults to true. */
  mustChangePassword?: boolean;
}

export type ProvisionResult = 'created' | 'updated' | 'exists';

/**
 * Create the initial Super Admin. The password is stored only as a scrypt hash and
 * can require a password change on first sign-in (default: true). Existing accounts
 * are left untouched unless `reset` is set.
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

  const mustChange = input.mustChangePassword ?? true ? 1 : 0;
  const hash = await hashPassword(input.password);
  if (existing) {
    db.prepare(`UPDATE users SET name = ?, role = 'super_admin', password_hash = ?, must_change_password = ?, is_active = 1,
                failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`)
      .run(name, hash, mustChange, nowIso(), existing.id);
    revokeUserSessions(db, existing.id);
    return 'updated';
  }
  db.prepare(`INSERT INTO users (email, name, role, password_hash, must_change_password, created_at, updated_at)
              VALUES (?, ?, 'super_admin', ?, ?, ?, ?)`)
    .run(loginId, name, hash, mustChange, nowIso(), nowIso());
  return 'created';
}
