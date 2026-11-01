// The sign-in rate limit (carried into task 4): failed attempts are counted
// per username and per client; once a count reaches its limit, that door is
// refused until its window ends. The routes are tested against the running
// Worker in test/guards/doors.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, attemptBlock, clientKey, userKey } from '../../src/auth/limits.ts';

const T0 = Date.UTC(2026, 10, 1, 9, 0, 0);
const MIN = 60_000;

test('limits: five failures per username in 15 minutes, fifty per client in an hour', () => {
  assert.deepEqual(LIMITS.user, { failures: 5, windowMs: 15 * MIN });
  assert.deepEqual(LIMITS.client, { failures: 50, windowMs: 60 * MIN });
});

test('limits: a username is refused from its fifth failure until 15 minutes after the first', () => {
  const row = (failures: number) => [{ key: userKey('hadeer'), window_start: T0, failures }];
  assert.equal(attemptBlock(row(4), T0 + MIN), null, 'four failures: not refused');
  assert.deepEqual(attemptBlock(row(5), T0 + MIN), { until: T0 + 15 * MIN });
  assert.deepEqual(attemptBlock(row(9), T0 + 15 * MIN - 1), { until: T0 + 15 * MIN });
  assert.equal(attemptBlock(row(5), T0 + 15 * MIN), null, 'the window has ended');
});

test('limits: a client is refused from its fiftieth failure until an hour after the first', async () => {
  const key = await clientKey('203.0.113.7');
  assert.equal(attemptBlock([{ key, window_start: T0, failures: 49 }], T0 + MIN), null);
  assert.deepEqual(attemptBlock([{ key, window_start: T0, failures: 50 }], T0 + MIN), { until: T0 + 60 * MIN });
  assert.equal(attemptBlock([{ key, window_start: T0, failures: 50 }], T0 + 60 * MIN), null);
});

test('limits: when both doors are refused, the later end wins', async () => {
  const rows = [
    { key: userKey('hadeer'), window_start: T0, failures: 5 },
    { key: await clientKey('203.0.113.7'), window_start: T0 - 30 * MIN, failures: 50 },
  ];
  assert.deepEqual(attemptBlock(rows, T0), { until: T0 + 30 * MIN });
  assert.deepEqual(attemptBlock([], T0), null);
});

test('limits: keys name the username, but never store the client address itself', async () => {
  assert.equal(userKey(' Hadeer '), 'u:hadeer');
  const key = await clientKey('203.0.113.7');
  assert.match(key, /^c:[0-9a-f]{16,}$/);
  assert.ok(!key.includes('203.0.113.7'));
  assert.equal(await clientKey('203.0.113.7'), key, 'the same client, the same key');
  assert.notEqual(await clientKey('203.0.113.8'), key);
});
