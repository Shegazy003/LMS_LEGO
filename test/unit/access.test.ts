import { test } from 'node:test';
import assert from 'node:assert/strict';
import { membershipActive, utcDate, addDays } from '../../src/access.ts';
import { sessionDecision, SESSION_IDLE_MS } from '../../src/auth/session.ts';

const day = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0); // 2026-11-01 12:00 UTC

test('access: dates are UTC calendar days', () => {
  assert.equal(utcDate(T0), '2026-11-01');
  assert.equal(addDays('2026-11-01', 30), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('access: a membership is active up to and including its end date', () => {
  const end = addDays(utcDate(T0), 30);
  assert.equal(membershipActive(end, T0), true);
  assert.equal(membershipActive(end, T0 + 30 * day), true, 'still active on the end date itself');
  assert.equal(membershipActive(end, Date.UTC(2026, 11, 1, 23, 59, 59)), true);
  assert.equal(membershipActive(end, Date.UTC(2026, 11, 2, 0, 0, 0)), false, 'ended the day after');
  assert.equal(membershipActive(end, T0 + 31 * day), false);
});

test('sessions: expire after 30 days without use', () => {
  assert.equal(SESSION_IDLE_MS, 30 * day);
  const expiresAt = T0 + SESSION_IDLE_MS;
  assert.equal(sessionDecision(expiresAt, T0), 'valid');
  assert.equal(sessionDecision(expiresAt, expiresAt), 'expired');
  assert.equal(sessionDecision(expiresAt, expiresAt + 1), 'expired');
});

test('sessions: use extends the session, but at most one database write per day', () => {
  const expiresAt = T0 + SESSION_IDLE_MS;
  assert.equal(sessionDecision(expiresAt, T0 + day - 1), 'valid', 'no write within the first day');
  assert.equal(sessionDecision(expiresAt, T0 + day), 'refresh');
  assert.equal(sessionDecision(expiresAt, T0 + 29 * day), 'refresh');
});
