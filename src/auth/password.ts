// Password hashing with PBKDF2-SHA256 from Web Crypto (available in Workers
// and in Node). Stored form: pbkdf2-sha256$<iterations>$<salt>$<hash>, with
// salt and hash in base64url. Every stored hash carries its own iteration
// count, so the strength can change without breaking older hashes: verifying
// reads the count from the stored value, and a successful sign-in re-writes a
// hash whose count differs from the configured one (build task 7).
//
// The strength is the deploy-time setting PASSWORD_ITERATIONS (wrangler.jsonc
// "vars"), read strictly by passwordIterations():
// - absent: DEFAULT_ITERATIONS, today's 100,000;
// - a whole number from PASSWORD_FLOOR (10,000) to PASSWORD_CEILING (100,000):
//   used as it is;
// - anything else: refused. The Worker then answers every request with a
//   server error and logs why (src/app.ts), rather than hash at a strength
//   nobody chose. The deploy's smoke check fails on that, so a bad value is
//   seen at once and rolled back.
// The ceiling is the highest count Cloudflare's Workers runtime accepts for
// PBKDF2; it also keeps a typo from making every sign-in slower than today.
import type { Db } from '../db.ts';
import { b64urlDecode, b64urlEncode } from './encoding.ts';

export const PASSWORD_FLOOR = 10_000;
export const PASSWORD_CEILING = 100_000;
export const DEFAULT_ITERATIONS = 100_000;
/** Today's strength, the default (kept under its earlier name). */
export const PBKDF2_ITERATIONS = DEFAULT_ITERATIONS;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const PREFIX = 'pbkdf2-sha256';

/** A PASSWORD_ITERATIONS value the Worker refuses to run with. */
export class PasswordSettingError extends Error {}

/** A whole number in the floor-to-ceiling range, written plainly (no sign, no leading zero). */
function strength(text: string): number | null {
  if (!/^[1-9][0-9]{0,8}$/.test(text)) return null;
  const n = Number(text);
  return n >= PASSWORD_FLOOR && n <= PASSWORD_CEILING ? n : null;
}

/** The configured strength from the PASSWORD_ITERATIONS setting (see the top of this file). */
export function passwordIterations(raw: unknown): number {
  if (raw === undefined) return DEFAULT_ITERATIONS;
  const n = typeof raw === 'string' ? strength(raw) : typeof raw === 'number' && Number.isInteger(raw) ? strength(String(raw)) : null;
  if (n === null) {
    throw new PasswordSettingError(
      `PASSWORD_ITERATIONS must be a whole number from ${PASSWORD_FLOOR} to ${PASSWORD_CEILING} (or absent for ${DEFAULT_ITERATIONS}); ` +
        `got ${JSON.stringify(raw)}. The Worker refuses to serve until it is corrected in wrangler.jsonc.`,
    );
  }
  return n;
}

interface Parsed {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

function parse(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const iterations = strength(parts[1]);
  const salt = b64urlDecode(parts[2]);
  const hash = b64urlDecode(parts[3]);
  if (iterations === null || !salt || !hash || salt.length < SALT_BYTES || hash.length !== HASH_BITS / 8) return null;
  return { iterations, salt, hash };
}

/** The strength a stored hash was made with, or null if the stored value is not a hash this product accepts. */
export function storedIterations(stored: string): number | null {
  return parse(stored)?.iterations ?? null;
}

/** Whether a stored hash should be re-written at the configured strength. */
export function needsRehash(stored: string, iterations: number): boolean {
  return storedIterations(stored) !== iterations;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

/** Hashes a password at the given strength (the product passes the configured one). */
export async function hashPassword(password: string, iterations: number): Promise<string>;
// The default only serves callers outside the type check (earlier tests);
// the signature above makes every caller in src/ name the strength.
export async function hashPassword(password: string, iterations: number = DEFAULT_ITERATIONS): Promise<string> {
  if (strength(String(iterations)) !== iterations) throw new PasswordSettingError(`cannot hash at ${iterations} iterations`);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `${PREFIX}$${iterations}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

/** Checks a password against a stored hash, at the strength the hash records. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const actual = await derive(password, parsed.salt, parsed.iterations);
  return timingSafeEqual(actual, parsed.hash);
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** A real hash of a random password at the configured strength, used to spend
 * the same time when a username does not exist (so sign-in timing does not
 * reveal usernames). Made once per strength in each Worker instance. */
const dummies = new Map<number, Promise<string>>();
export function dummyHash(iterations: number): Promise<string>;
export function dummyHash(iterations: number = DEFAULT_ITERATIONS): Promise<string> {
  let dummy = dummies.get(iterations);
  if (!dummy) {
    dummy = hashPassword(b64urlEncode(crypto.getRandomValues(new Uint8Array(16))), iterations);
    dummies.set(iterations, dummy);
  }
  return dummy;
}

/** After a successful sign-in with `password`: if the stored hash was made at
 * another strength, re-writes it at the configured one. One database write,
 * and only when needed; the write applies only if the stored hash is still the
 * one that was checked (a password changed meanwhile is never overwritten).
 * Returns whether a write was made. */
export async function rehashIfNeeded(
  db: Db,
  user: { id: string; password_hash: string },
  password: string,
  iterations: number,
): Promise<boolean> {
  if (!needsRehash(user.password_hash, iterations)) return false;
  const changed = await db.run(
    'UPDATE user SET password_hash = ? WHERE id = ? AND password_hash = ?',
    await hashPassword(password, iterations), user.id, user.password_hash,
  );
  return changed === 1;
}
