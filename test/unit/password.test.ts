import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, PBKDF2_ITERATIONS } from '../../src/auth/password.ts';

test('password: PBKDF2-SHA256 hash verifies the right password only', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.match(stored, /^pbkdf2-sha256\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.ok(!stored.includes('correct horse battery'), 'plain password must not be stored');
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('correct horse batterz', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('password: each hash has its own salt', async () => {
  const a = await hashPassword('same password');
  const b = await hashPassword('same password');
  assert.notEqual(a, b);
});

test('password: uses the Workers maximum of 100,000 PBKDF2 iterations', async () => {
  assert.equal(PBKDF2_ITERATIONS, 100_000);
  const stored = await hashPassword('x'.repeat(12));
  assert.equal(stored.split('$')[1], '100000');
});

test('password: malformed stored values never verify', async () => {
  assert.equal(await verifyPassword('anything', ''), false);
  assert.equal(await verifyPassword('anything', 'plain-text'), false);
  assert.equal(await verifyPassword('anything', 'pbkdf2-sha256$1$AA$AA'), false);
});
