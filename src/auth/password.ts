// Password hashing with PBKDF2-SHA256 from Web Crypto (available in Workers
// and in Node). Stored form: pbkdf2-sha256$<iterations>$<salt>$<hash>, with
// salt and hash in base64url. 100,000 is the highest iteration count the
// Workers runtime accepts.
import { b64urlDecode, b64urlEncode } from './encoding.ts';

export const PBKDF2_ITERATIONS = 100_000;

// Build task 7 scaffolding (red): the names the password-strength tests use.
// The behaviour is not built yet.
export const PASSWORD_FLOOR = 10_000;
export const PASSWORD_CEILING = 100_000;
export const DEFAULT_ITERATIONS = 100_000;
export class PasswordSettingError extends Error {}
const notBuilt = (): never => {
  throw new Error('password strength setting: not built yet (build task 7)');
};
export function passwordIterations(_raw: unknown): number {
  return notBuilt();
}
export function storedIterations(_stored: string): number | null {
  return notBuilt();
}
export function needsRehash(_stored: string, _iterations: number): boolean {
  return notBuilt();
}
const SALT_BYTES = 16;
const HASH_BITS = 256;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, _iterations?: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  if (iterations !== PBKDF2_ITERATIONS) return false;
  const salt = b64urlDecode(parts[2]);
  const expected = b64urlDecode(parts[3]);
  if (!salt || !expected || salt.length < SALT_BYTES || expected.length !== HASH_BITS / 8) return false;
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** A real hash of a random password, used to spend the same time when a
 * username does not exist (so sign-in timing does not reveal usernames). */
let dummy: Promise<string> | null = null;
export function dummyHash(_iterations?: number): Promise<string> {
  dummy ??= hashPassword(b64urlEncode(crypto.getRandomValues(new Uint8Array(16))));
  return dummy;
}
