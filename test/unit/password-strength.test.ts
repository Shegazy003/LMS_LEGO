// Build task 7: password strength as a deploy-time setting.
//
// - A stored hash carries its own iteration count
//   (pbkdf2-sha256$<iterations>$<salt>$<hash>); verifying reads it from there,
//   so every hash written before this task (100,000 iterations) still verifies.
// - A tampered iteration field (negative, huge, not a whole number, outside
//   the floor and ceiling) never verifies and never derives anything.
// - The setting PASSWORD_ITERATIONS is read strictly: absent means today's
//   100,000; a whole number from 10,000 to 100,000 is used as it is; anything
//   else is refused (the Worker answers every request with a server error
//   instead of hashing at a strength nobody chose).
// - The dummy hash used for an unknown username costs the same as a real
//   verify at the configured strength: it is made at that strength.
// The routes (sign-in re-writes, reset link, recovery code) are tested against
// the running Worker in test/password/strength.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ITERATIONS, PASSWORD_CEILING, PASSWORD_FLOOR, PasswordSettingError, dummyHash, hashPassword, needsRehash,
  passwordIterations, storedIterations, verifyPassword,
} from '../../src/auth/password.ts';

// Written by the code on main before build task 7 (552409e), for the password
// "written-before-task-7". Every stored hash in that format must keep working.
const WRITTEN_BEFORE = 'pbkdf2-sha256$100000$kBUYJ6Apq0J3zuuu7GZZkw$qo3TNXhowWVZMXhznE0PqhLtIkqDX3Re2jB8m4eLGPY';

const withIterations = (stored: string, field: string) => {
  const parts = stored.split('$');
  parts[1] = field;
  return parts.join('$');
};

test('password strength: floor 10,000, ceiling 100,000, default 100,000 (today\'s strength, unchanged)', () => {
  assert.equal(PASSWORD_FLOOR, 10_000);
  assert.equal(PASSWORD_CEILING, 100_000);
  assert.equal(DEFAULT_ITERATIONS, 100_000);
});

test('password strength: a hash round-trips at the strength it was made with, and records that strength', async () => {
  for (const n of [PASSWORD_FLOOR, 20_000, 50_000, PASSWORD_CEILING]) {
    const stored = await hashPassword('correct horse battery', n);
    assert.match(stored, new RegExp(`^pbkdf2-sha256\\$${n}\\$[A-Za-z0-9_-]{22}\\$[A-Za-z0-9_-]{43}$`), `format at ${n}`);
    assert.equal(storedIterations(stored), n);
    assert.equal(await verifyPassword('correct horse battery', stored), true, `right password at ${n}`);
    assert.equal(await verifyPassword('correct horse batterz', stored), false, `wrong password at ${n}`);
  }
});

test('password strength: a hash written before this task (today\'s format, 100,000) still verifies', async () => {
  assert.equal(storedIterations(WRITTEN_BEFORE), 100_000);
  assert.equal(await verifyPassword('written-before-task-7', WRITTEN_BEFORE), true);
  assert.equal(await verifyPassword('written-before-task-8', WRITTEN_BEFORE), false);
  // The hash is bound to its count: the same salt and hash read at another count do not verify.
  assert.equal(await verifyPassword('written-before-task-7', withIterations(WRITTEN_BEFORE, '20000')), false);
});

test('password strength: a tampered iteration field never verifies and is not read as a strength', async () => {
  const stored = await hashPassword('tamper-me-please', 20_000);
  for (const field of [
    '-20000', '0', '1', '9999', '100001', '1000000', '999999999999', '1e5', '20000.0', '+20000', ' 20000', '020000',
    '0x4e20', 'abc', '', 'NaN', 'Infinity',
  ]) {
    const bad = withIterations(stored, field);
    assert.equal(storedIterations(bad), null, `"${field}" is not a stored strength`);
    assert.equal(await verifyPassword('tamper-me-please', bad), false, `"${field}" never verifies`);
  }
  assert.equal(storedIterations('plain-text'), null);
  assert.equal(storedIterations('bcrypt$20000$AA$AA'), null);
  assert.equal(storedIterations('pbkdf2-sha256$20000$AA'), null);
});

test('password strength: the setting is read strictly; absent means today\'s 100,000', () => {
  assert.equal(passwordIterations(undefined), 100_000, 'absent: the default');
  assert.equal(passwordIterations('100000'), 100_000);
  assert.equal(passwordIterations('10000'), 10_000, 'the floor itself is allowed');
  assert.equal(passwordIterations('25000'), 25_000);
  assert.equal(passwordIterations(30_000), 30_000, 'a number in the configuration file is read too');
});

test('password strength: a setting below the floor, above the ceiling or not a whole number is refused', () => {
  for (const raw of [
    '9999', '0', '-100000', '100001', '1000000', '', ' ', '1e5', '100,000', '100_000', '20000.5', '+20000', 'abc',
    9_999, 100_001, 20_000.5, Number.NaN, null, true, {},
  ]) {
    assert.throws(() => passwordIterations(raw), PasswordSettingError, `refuses ${JSON.stringify(raw)}`);
  }
  assert.throws(() => passwordIterations('5000'), /PASSWORD_ITERATIONS.*10000.*100000/, 'the refusal names the setting and its range');
});

test('password strength: a stored hash needs re-writing exactly when its strength differs from the setting', async () => {
  const at20 = await hashPassword('rehash-check-pass', 20_000);
  assert.equal(needsRehash(at20, 20_000), false, 'same strength: nothing to write');
  assert.equal(needsRehash(at20, 100_000), true, 'upgrade');
  assert.equal(needsRehash(WRITTEN_BEFORE, 20_000), true, 'downgrade');
  assert.equal(needsRehash(WRITTEN_BEFORE, 100_000), false, 'an old hash at today\'s default stays as it is');
});

test('password strength: the dummy hash for an unknown username is made at the configured strength', async () => {
  for (const n of [PASSWORD_FLOOR, 20_000, PASSWORD_CEILING]) {
    const dummy = await dummyHash(n);
    assert.equal(storedIterations(dummy), n, `dummy at ${n}`);
    assert.equal(await dummyHash(n), dummy, 'made once per strength, then reused');
  }
});
