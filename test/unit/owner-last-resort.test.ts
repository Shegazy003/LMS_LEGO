// The owner's last-resort reset script (scripts/owner-last-resort.mjs) makes a
// recovery code and its hash on the owner's own computer, with the same scheme
// as the product (src/auth/tokens.ts), and prints one Wrangler command that
// carries only the hash. The live walk-through against the local database is
// in test/deploy/last-resort.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newRecoveryCode as productCode, recoveryCodeHash as productHash } from '../../src/auth/tokens.ts';

const script = () => import('../../scripts/owner-last-resort.mjs');
const CODE_SHAPE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

test('last resort: the script\'s codes have the product\'s shape, and are different every time', async () => {
  const { newRecoveryCode } = await script();
  const codes = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = newRecoveryCode();
    assert.match(code, CODE_SHAPE);
    codes.add(code);
  }
  assert.equal(codes.size, 200);
  assert.match(productCode(), CODE_SHAPE, 'the product makes the same shape');
});

test('last resort: the script hashes a code exactly as the product does, however it is typed', async () => {
  const { newRecoveryCode, recoveryCodeHash } = await script();
  for (let i = 0; i < 50; i++) {
    const code = newRecoveryCode();
    for (const typed of [code, code.toLowerCase(), code.replace(/-/g, ''), ` ${code.replace(/-/g, ' ')} `]) {
      assert.equal(await recoveryCodeHash(typed), await productHash(typed), `same hash for "${typed}"`);
    }
  }
});

test('last resort: the printed command carries only the hash, targets the live database by name, and changes only the owner row', async () => {
  const { resetCommand, resetSql, recoveryCodeHash, newRecoveryCode, DATABASE } = await script();
  const config = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(DATABASE, config.d1_databases[0].database_name, 'the database name is the one in wrangler.jsonc');
  const code = newRecoveryCode();
  const hash = await recoveryCodeHash(code);
  const command = resetCommand(hash);
  assert.equal(command, `npx wrangler d1 execute lms-lego --remote --command "${resetSql(hash)}"`);
  assert.equal(resetSql(hash), `UPDATE user SET recovery_hash = '${hash}' WHERE is_owner = 1; SELECT username FROM user WHERE is_owner = 1;`);
  assert.ok(!command.includes(code) && !command.includes(code.replace(/-/g, '')), 'the code itself never travels');
  assert.throws(() => resetSql("x'; DROP TABLE user; --"), /64 lowercase hex/, 'only a hash can be placed in the SQL');
});
