// Membership checks honour valid_from as well as valid_until (carried into
// task 4). A membership counts from the start of its first day to the end of
// its last day, both UTC calendar days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { membershipStatus } from '../../src/access.ts';

test('access: a membership has not started before its start date, is active from it through its end date, then ended', () => {
  const from = '2026-11-10';
  const until = '2026-12-10';
  assert.equal(membershipStatus(from, until, Date.UTC(2026, 10, 9, 23, 59, 59)), 'not-started');
  assert.equal(membershipStatus(from, until, Date.UTC(2026, 10, 10, 0, 0, 0)), 'active', 'from the first moment of the start date');
  assert.equal(membershipStatus(from, until, Date.UTC(2026, 11, 10, 23, 59, 59)), 'active', 'through the end date');
  assert.equal(membershipStatus(from, until, Date.UTC(2026, 11, 11, 0, 0, 0)), 'ended');
});
