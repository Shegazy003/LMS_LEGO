import { test } from 'node:test';
import assert from 'node:assert/strict';
import { membershipActive, membershipStatus, utcDate, addDays } from '../../src/access.ts';
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

test('access: a membership ended now (ended_on, release 1.1 AT-6) is ended at once, whatever its end date', () => {
  const today = utcDate(T0);
  const end = addDays(today, 30);
  assert.equal(membershipStatus(today, end, T0), 'active');
  assert.equal(membershipStatus(today, end, T0, null), 'active', 'no ended_on: the dates decide');
  assert.equal(membershipStatus(today, end, T0, today), 'ended', 'ended today, at midday: ended at once');
  assert.equal(membershipStatus(addDays(today, 3), end, T0, today), 'ended', 'even before its start date');
  assert.equal(membershipStatus(today, today, T0), 'active', 'an end date of today keeps access through that UTC day');
  assert.equal(membershipStatus(today, today, Date.UTC(2026, 10, 2, 0, 0, 1)), 'ended', 'and ends at 00:00 UTC the next day');
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
