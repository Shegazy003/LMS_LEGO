// One-time reset links (docs/02-LEGO-MODEL.md, rule 5; product contract, AT-2
// and the safeguards in section 8).
//
// - The token is 256 random bits; only its SHA-256 is stored.
// - A link works for 30 minutes from its creation, and once.
// - Issuing a link marks every older link of that person used.
// - The page asks for the username; a wrong one does not use the link up, but
//   after RESET_MAX_ATTEMPTS wrong usernames the link is dead.
// - Setting the password ends every sign-in of that person.
// - The appointer sends the link from their own WhatsApp through a wa.me link
//   with the product's fixed message, or copies it. The product never calls
//   any messaging service.
import type { Db } from './db.ts';
import type { Label } from './labels.ts';
import { randomToken, tokenHash } from './auth/tokens.ts';

export const RESET_LINK_MS = 30 * 60_000;
export const RESET_MAX_ATTEMPTS = 5;

export function newResetToken(): string {
  return randomToken(32);
}

export interface LinkRow {
  expires_at: number;
  used_at: number | null;
  failed_attempts: number;
}

export type LinkState = 'usable' | 'used' | 'expired' | 'spent';

export function resetLinkState(row: LinkRow, now: number): LinkState {
  if (row.used_at !== null) return 'used';
  if (now >= Number(row.expires_at)) return 'expired';
  if (Number(row.failed_attempts) >= RESET_MAX_ATTEMPTS) return 'spent';
  return 'usable';
}

/** The WhatsApp button: https://wa.me/<digits>?text=<message>, for a number in
 * international form (+ and digits). Anything else gets no button (null). */
export function whatsappHref(mobile: string, message: string): string | null {
  if (!/^\+[1-9]\d{6,14}$/.test(mobile)) return null;
  return `https://wa.me/${mobile.slice(1)}?text=${encodeURIComponent(message)}`;
}

/** What an appointer sees of a registered number. */
export function lastDigits(mobile: string): string {
  return mobile.slice(-4);
}

/** The fixed message, from the product dictionary, in the language of `t`. */
export function resetMessage(
  t: Label,
  v: { space: string; sender: string; role: string; name: string; address: string; link: string },
): string {
  return t('resetMessage', v);
}

// ------------------------------------------------------------- storage ----
/** Kills every earlier link of this person and makes a new one; returns the token. */
export async function issueResetLink(
  db: Db,
  v: { userId: string; spaceId: string; createdBy: string; now: number },
): Promise<string> {
  const token = newResetToken();
  await db.batch([
    ['UPDATE reset_link SET used_at = ? WHERE user_id = ? AND used_at IS NULL', v.now, v.userId],
    [
      'INSERT INTO reset_link (id, user_id, space_id, token_hash, created_at, expires_at, used_at, failed_attempts, created_by) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?)',
      crypto.randomUUID(), v.userId, v.spaceId, await tokenHash(token), v.now, v.now + RESET_LINK_MS, v.createdBy,
    ],
  ]);
  return token;
}

export interface FoundLink extends LinkRow {
  id: string;
  user_id: string;
  username: string;
  space_id: string;
  space_name: string;
  kit_json: string;
}

/** The link a token belongs to (whatever its state), with its person and space. */
export async function findResetLink(db: Db, token: string): Promise<FoundLink | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return db.first<FoundLink>(
    `SELECT r.id, r.user_id, r.expires_at, r.used_at, r.failed_attempts, u.username,
            r.space_id, s.name AS space_name, k.json AS kit_json
       FROM reset_link r JOIN user u ON u.id = r.user_id JOIN space s ON s.id = r.space_id JOIN kit k ON k.id = s.kit_id
      WHERE r.token_hash = ?`,
    await tokenHash(token),
  );
}

/** Counts a wrong username on a link. */
export async function countWrongUsername(db: Db, linkId: string): Promise<void> {
  await db.run('UPDATE reset_link SET failed_attempts = failed_attempts + 1 WHERE id = ?', linkId);
}

/** Uses the link and sets the password, only if the link is still usable at
 * this moment (two tabs racing: exactly one wins). Every sign-in of the person
 * ends. Returns whether the password was set. */
export async function useResetLink(db: Db, link: FoundLink, passwordHash: string, now: number): Promise<boolean> {
  const claimed = await db.run(
    'UPDATE reset_link SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ? AND failed_attempts < ?',
    now, link.id, now, RESET_MAX_ATTEMPTS,
  );
  if (claimed !== 1) return false;
  await db.batch([
    ['UPDATE user SET password_hash = ? WHERE id = ?', passwordHash, link.user_id],
    ['DELETE FROM session WHERE user_id = ?', link.user_id],
  ]);
  return true;
}
