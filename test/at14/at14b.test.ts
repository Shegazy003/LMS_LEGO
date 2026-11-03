// AT-14b (contract product-contract-r2, section 9): the written rollback rule.
// The README's "Rollback" section states what stays: guardian links (and, from
// later tasks, marks and lesson-view rows) stay in the database, invisible, and
// return when release 2 is redeployed; while old code runs, nothing is shown
// and nothing is deleted; deleting such data is a manual database action by
// the owner, a RED decision. AT-14a (CI job "rollback") proves the behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

test('AT-14b the README states what stays on a rollback, and who may delete it', () => {
  const section = readme.match(/\n## Rollback\n([\s\S]*?)(?=\n## )/)?.[1] ?? '';
  assert.ok(section, 'README has a "## Rollback" section');
  for (const phrase of [
    'guardian links', 'marks', 'lesson-view rows', 'stay in the database', 'invisible', 'return when release 2 is redeployed',
    'nothing is shown', 'nothing is deleted', 'manual database action by the owner', 'RED', '528786a4', 'CI job `rollback`',
  ]) assert.ok(section.includes(phrase), `the Rollback section says: ${phrase}`);
});
