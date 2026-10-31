import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UsageMeter, FLUSH_INTERVAL_MS, FREE_PLAN, formatBytes } from '../../src/usage.ts';

const T0 = Date.UTC(2026, 10, 1, 9, 0, 0);

test('usage: free-plan lines from the hosting decision', () => {
  assert.equal(FREE_PLAN.requestsPerDay, 100_000);
  assert.equal(FREE_PLAN.writesPerDay, 100_000);
  assert.equal(FREE_PLAN.storageBytes, 10 * 1000 ** 3);
});

test('usage: counting is in memory; at most one flush per minute however many requests', () => {
  const m = new UsageMeter(T0);
  let flushes = 0;
  for (let i = 0; i < 5000; i++) {
    const now = T0 + i * 10; // 5000 requests over 50 seconds
    m.recordRequest(now);
    if (m.takeFlush(now)) flushes++;
  }
  assert.equal(flushes, 0, 'no flush before a minute has passed');
  assert.ok(FLUSH_INTERVAL_MS >= 60_000);
  const batch = m.takeFlush(T0 + FLUSH_INTERVAL_MS);
  assert.ok(batch);
  assert.deepEqual(batch, { day: '2026-11-01', requests: 5000, writes: 0 });
  assert.equal(m.takeFlush(T0 + FLUSH_INTERVAL_MS + 1), null, 'nothing pending right after a flush');
});

test('usage: pending counts are visible before they are flushed', () => {
  const m = new UsageMeter(T0);
  m.recordRequest(T0);
  m.recordRequest(T0);
  m.recordWrites(3, T0);
  assert.deepEqual(m.pending('2026-11-01'), { requests: 2, writes: 3 });
  assert.deepEqual(m.pending('2026-11-02'), { requests: 0, writes: 0 });
});

test('usage: a failed flush puts its counts back', () => {
  const m = new UsageMeter(T0);
  m.recordRequest(T0);
  const batch = m.takeFlush(T0 + FLUSH_INTERVAL_MS)!;
  m.restore(batch);
  assert.deepEqual(m.pending('2026-11-01'), { requests: 1, writes: 0 });
});

test('usage: a new day flushes the previous day separately', () => {
  const m = new UsageMeter(T0);
  m.recordRequest(T0);
  const nextDay = T0 + 86_400_000;
  m.recordRequest(nextDay);
  const first = m.takeFlush(nextDay);
  assert.deepEqual(first, { day: '2026-11-01', requests: 1, writes: 0 });
  assert.deepEqual(m.pending('2026-11-02'), { requests: 1, writes: 0 });
});

test('usage: bytes are shown in plain units', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(79), '79 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(10 * 1000 ** 3), '10 GB');
});
