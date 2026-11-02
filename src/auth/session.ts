// Server-side sessions: the cookie holds a random token, the database holds
// only its hash. A session expires after 30 days without use. Use extends it,
// but the extension is written at most once a day so that browsing does not
// spend the daily database-write allowance.
import type { Db } from '../db.ts';

export const SESSION_IDLE_MS = 30 * 86_400_000;
const REFRESH_AFTER_MS = 86_400_000;
export const SESSION_COOKIE = 'lms_session';

export function sessionDecision(expiresAt: number, now: number): 'valid' | 'refresh' | 'expired' {
  const remaining = expiresAt - now;
  if (remaining <= 0) return 'expired';
  if (remaining <= SESSION_IDLE_MS - REFRESH_AFTER_MS) return 'refresh';
  return 'valid';
}

/** Writes a session's new expiry (the once-a-day refresh); returns the rows changed. */
export function refreshSession(db: Db, id: string, expiresAt: number): Promise<number> {
  return db.run('UPDATE session SET expires_at = ? WHERE id = ?', expiresAt, id);
}
