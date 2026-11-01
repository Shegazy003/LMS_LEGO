#!/usr/bin/env node
// The owner's last-resort reset: for when BOTH the owner password and the
// recovery code are lost (product contract, section 7, note on question 6).
//
// Run it on your own computer:   node scripts/owner-last-resort.mjs
//
// It makes a fresh recovery code and its hash HERE, on this computer, with the
// same scheme the product uses (src/auth/tokens.ts). The code itself never
// leaves this computer: only its hash goes into the one command it prints.
// You (the Cloudflare account holder, and nobody else) then run that command,
// which puts the new hash in place of the old one in the live database; then
// open the product's normal /recover page and use the new code to choose a new
// password. That ends every old sign-in and gives you a further new code.
//
// It changes nothing by itself and needs no network, no account and no
// packages: Node.js 18 or later is enough.
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** The database name in wrangler.jsonc (the test checks they agree). */
export const DATABASE = 'lms-lego';

// Same alphabet and shape as src/auth/tokens.ts: 32 symbols without 0/O and
// 1/I, 16 characters (80 bits), shown as four groups of four.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRecoveryCode() {
  const bytes = webcrypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => ALPHABET[b % 32]); // 256 is a multiple of 32: no bias
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** SHA-256 hex of 'recovery:' + the code in capitals without dashes, as the product stores it. */
export async function recoveryCodeHash(code) {
  const normalised = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('recovery:' + normalised));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The SQL: replace the owner's recovery-code hash, then show the owner's username (needed on /recover). */
export function resetSql(hash) {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('the hash must be 64 lowercase hex characters');
  return `UPDATE user SET recovery_hash = '${hash}' WHERE is_owner = 1; SELECT username FROM user WHERE is_owner = 1;`;
}

/** The single command the account holder runs against the live database. */
export function resetCommand(hash, database = DATABASE) {
  return `npx wrangler d1 execute ${database} --remote --command "${resetSql(hash)}"`;
}

async function main() {
  const code = newRecoveryCode();
  const command = resetCommand(await recoveryCodeHash(code));
  console.log(`LMS Lego: the owner's last-resort reset

1. Your new recovery code (shown only now; write it on paper):

   ${code}

2. Run this one command on this computer. It asks you to sign in to your
   Cloudflare account first if you are not signed in (or run: npx wrangler login).
   It replaces the old recovery code with the new one and shows your username:

${command}

   (Or, in the Cloudflare dashboard, open D1, then the database ${DATABASE},
   then Console; paste the text between the double quotes above and run it.)

3. Open your LMS Lego address at /recover, type your username, the new code
   and a new password. Every old sign-in ends, and you get a further new code
   to keep on paper.

Nothing has been changed yet: step 2 is what changes the live database.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
