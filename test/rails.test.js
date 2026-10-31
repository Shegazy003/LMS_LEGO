// Rails check: proves the test runner and CI are wired before any product
// code exists. The Builder replaces this with AT-1 … AT-5 tests, one file each,
// and keeps this file until the first real test is green in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rails: package declares the node test runner', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.test, 'node --test');
});

test('rails: product contract names five acceptance tests', () => {
  const contract = readFileSync(new URL('../docs/01-PRODUCT-CONTRACT.md', import.meta.url), 'utf8');
  for (const id of ['AT-1', 'AT-2', 'AT-3', 'AT-4', 'AT-5']) {
    assert.ok(contract.includes(`### ${id}`), `${id} missing from the product contract`);
  }
});
