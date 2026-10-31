import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRecoveryCode, recoveryCodeHash } from '../../src/auth/tokens.ts';

test('recovery code: 16 unambiguous characters in four groups, different every time', () => {
  const a = newRecoveryCode();
  const b = newRecoveryCode();
  assert.match(a, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.notEqual(a, b);
});

test('recovery code: only a hash is kept, and typing tolerates case, spaces and dashes', async () => {
  const code = newRecoveryCode();
  const h = await recoveryCodeHash(code);
  assert.ok(!h.includes(code.replace(/-/g, '')));
  assert.equal(await recoveryCodeHash(code.toLowerCase().replace(/-/g, ' ')), h);
  assert.notEqual(await recoveryCodeHash(newRecoveryCode()), h);
});
