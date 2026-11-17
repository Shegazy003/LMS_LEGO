// HK-1 (product-contract v2 on PIL-216, section 12): the wave test set-up
// survives a transient SQLITE_BUSY. The set-up's direct database statements
// (Product.sql, `wrangler d1 execute` beside the running Worker) go through
// withBusyRetry: a statement that meets "database is locked" is run again, up
// to 3 retries with a short wait and a warning each time. A busy statement is
// not committed, so running it again is safe. Any other error is not retried.
// This proves recovery from one busy error; it does not prove the original
// flake can never return.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withBusyRetry } from '../support/busy.ts';

// The shape of the error main run 43904114514 met (wrangler d1 execute, exit 1).
const busy = () => new Error('wrangler d1 execute lms-lego --local exited 1\nSQLite failed; database is locked: SQLITE_BUSY');

describe('W3a AT-5.3 set-up retries a busy database', () => {
  it('a set-up statement that meets one busy error still completes, with a warning', async () => {
    const statements: string[] = [];
    let failures = 1;
    const warnings: string[] = [];
    const sql = withBusyRetry(async (q: string) => {
      statements.push(q);
      if (failures-- > 0) throw busy();
      return [{ ok: 1 }];
    }, { waitMs: 1, warn: (m) => warnings.push(m) });
    const rows = await sql(`INSERT INTO exam_result_history (id) VALUES ('w3a-h')`);
    assert.deepEqual(rows, [{ ok: 1 }]);
    assert.equal(statements.length, 2, 'run once more after the busy error');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /SQLITE_BUSY.*retry 1 of 3/);
  });

  it('three busy errors in a row are still recovered; a fourth fails with the busy error', async () => {
    let calls = 0;
    const ok = withBusyRetry(async () => { if (++calls <= 3) throw busy(); return []; }, { waitMs: 1, warn: () => {} });
    assert.deepEqual(await ok('SELECT 1'), []);
    assert.equal(calls, 4);
    calls = 0;
    const never = withBusyRetry(async () => { calls++; throw busy(); }, { waitMs: 1, warn: () => {} });
    await assert.rejects(never('SELECT 1'), /SQLITE_BUSY/);
    assert.equal(calls, 4, 'one try and three retries');
  });

  it('any other error is not retried', async () => {
    let calls = 0;
    const sql = withBusyRetry(async () => { calls++; throw new Error('no such table: nothing'); }, { waitMs: 1, warn: () => {} });
    await assert.rejects(sql('SELECT * FROM nothing'), /no such table/);
    assert.equal(calls, 1);
  });

  it('the running product used by every wave set-up wraps its direct statements with the retry', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../support/product.ts', import.meta.url), 'utf8');
    assert.match(src, /sql: withBusyRetry\(/, 'startProduct().sql goes through withBusyRetry');
  });
});
