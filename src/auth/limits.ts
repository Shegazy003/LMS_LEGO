// The sign-in rate limit: failed attempts at a password door (sign-in, the
// owner's recovery code, a reset link's username) are counted per username and
// per client, in D1, so every Worker instance sees the same counts.
//
// - Username: 5 failures refuse that username until 15 minutes after the first
//   of them. That bounds guessing to a few hundred tries a day per account.
// - Client: 50 failures refuse that client (its address, as Cloudflare reports
//   it) until an hour after the first. A school behind one address has room for
//   ordinary mistakes; one machine trying many usernames does not.
//
// The free plan's scarce resource is database writes (100,000 a day), so:
// - a success writes nothing (it deletes the username's row only when one exists);
// - a failure writes one row per key (two), plus the removal of rows whose
//   window is over, each removed once;
// - a refused attempt reads one row per key, writes nothing, and does not even
//   compute the password hash.
// One client can therefore spend at most about 150 writes an hour (50 failures,
// two rows each, plus clean-up), whatever it sends.
//
// The client's address is never stored: its key is a hash of it.
import type { Db } from '../db.ts';
import { typedUsername } from '../names.ts';
import { sha256Hex } from './encoding.ts';

export const LIMITS = {
  user: { failures: 5, windowMs: 15 * 60_000 },
  client: { failures: 50, windowMs: 60 * 60_000 },
};

export interface AttemptRow {
  key: string;
  window_start: number;
  failures: number;
}

const limitFor = (key: string) => (key.startsWith('c:') ? LIMITS.client : LIMITS.user);

/** When any of the keys has reached its limit within its window: until when it is refused. */
export function attemptBlock(rows: readonly AttemptRow[], now: number): { until: number } | null {
  let until = 0;
  for (const r of rows) {
    const limit = limitFor(r.key);
    const end = Number(r.window_start) + limit.windowMs;
    if (Number(r.failures) >= limit.failures && now < end) until = Math.max(until, end);
  }
  return until ? { until } : null;
}

/** The username's key: bounded, because a username longer than the maximum is read as '' (src/names.ts). */
export function userKey(username: string): string {
  return 'u:' + typedUsername(username);
}

export async function clientKey(address: string): Promise<string> {
  return 'c:' + (await sha256Hex('lms-lego-client:' + address)).slice(0, 32);
}

/** One door: the keys of one attempt and their stored counts. */
export interface Door {
  keys: [string, string];
  rows: AttemptRow[];
}

export async function openDoor(db: Db, username: string, clientAddress: string): Promise<Door> {
  const keys: [string, string] = [userKey(username), await clientKey(clientAddress)];
  const rows = await db.all<AttemptRow>('SELECT key, window_start, failures FROM attempt_limit WHERE key IN (?, ?)', ...keys);
  return { keys, rows };
}

/** Counts a failure for both keys. A window that has ended starts again at this failure. */
export async function recordFailure(db: Db, door: Door, now: number): Promise<void> {
  const upsert = `INSERT INTO attempt_limit (key, window_start, failures) VALUES (?, ?, 1)
    ON CONFLICT (key) DO UPDATE SET
      failures = CASE WHEN attempt_limit.window_start <= ? THEN 1 ELSE attempt_limit.failures + 1 END,
      window_start = CASE WHEN attempt_limit.window_start <= ? THEN excluded.window_start ELSE attempt_limit.window_start END`;
  await db.batch([
    ...door.keys.map((key): [string, number | string, number, number, number] => {
      const over = now - limitFor(key).windowMs;
      return [upsert, key, now, over, over];
    }),
    ['DELETE FROM attempt_limit WHERE window_start <= ?', now - LIMITS.client.windowMs],
  ]);
}

/** After a success: forget the username's failures (a write only when there were some). */
export async function clearUser(db: Db, door: Door): Promise<void> {
  if (door.rows.some((r) => r.key === door.keys[0])) await db.run('DELETE FROM attempt_limit WHERE key = ?', door.keys[0]);
}

/** Whole minutes until a refusal ends, at least 1. */
export function minutesUntil(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 60_000));
}
