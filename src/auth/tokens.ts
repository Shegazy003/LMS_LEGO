// Random tokens (session cookies) and the owner's recovery code.
// Only SHA-256 hashes are stored: both carry at least 80 bits of randomness,
// so a slow hash adds nothing.
import { b64urlEncode, sha256Hex } from './encoding.ts';

export function randomToken(bytes = 32): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function tokenHash(token: string): Promise<string> {
  return sha256Hex(token);
}

// 32 symbols without 0/O, 1/I: 16 characters = 80 bits.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => ALPHABET[b % 32]); // 256 is a multiple of 32: no bias
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

export function recoveryCodeHash(code: string): Promise<string> {
  const normalised = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return sha256Hex('recovery:' + normalised);
}
