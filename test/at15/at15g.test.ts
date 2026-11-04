// AT-15g (contract product-contract-r2, R2-d): no automatic disposal. The
// product never deletes lesson_view rows by age. With the injected clock, a
// row whose date is 400 days old is still present and still shown (subject to
// AT-15c-2). The only deletions are switching the setting off (AT-15b) and a
// deletion on request (a manual database action by the owner, section 9): no
// code path other than the switch-off deletes lesson_view rows.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setClockOffsetDays, utcDatePlusDays } from '../support/http.ts';
import { A, G1 } from '../at9/world.ts';
import { activityWorld, guardianSees, moveToDay, open, switchOn, viewRows, type ActivityWorld } from './activity.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(p) ? [p] : [];
  });
}

test('AT-15g the code: the switch-off is the only statement that deletes lesson views, and nothing runs on a schedule', () => {
  const deletes: string[] = [];
  for (const f of [...files(join(root, 'src'), /\.ts$/), ...files(join(root, 'migrations'), /\.sql$/)]) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(DELETE\s+FROM|DROP\s+TABLE|TRUNCATE)\s+"?lesson_view"?(?![\w"])[^'`]*/gi)) deletes.push(`${relative(root, f).replace(/\\/g, '/')}: ${m[0].trim()}`);
    assert.ok(!/last_opened_on\s*<|date\(\s*'now'|julianday/i.test(text.replace(/excluded\.last_opened_on > lesson_view\.last_opened_on/g, '')), `${relative(root, f)}: no statement compares a view's date with a limit`);
  }
  assert.deepEqual(deletes, ['src/activity.ts: DELETE FROM lesson_view WHERE space_id = ?'], 'only switchOff deletes');
  const activity = readFileSync(join(root, 'src', 'activity.ts'), 'utf8');
  const off = activity.slice(activity.indexOf('export async function switchOff'));
  assert.ok(off.slice(0, off.indexOf('\n}\n')).includes('DELETE FROM lesson_view WHERE space_id = ?'), 'inside switchOff');
  const index = readFileSync(join(root, 'src', 'index.ts'), 'utf8');
  assert.ok(!/scheduled/.test(index), 'the Worker has no scheduled handler');
  const wrangler = readFileSync(join(root, 'wrangler.jsonc'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/"crons"|"triggers"/.test(wrangler), 'no cron trigger is configured');
});

describe('AT-15g a 400-day-old open is still stored and still shown', { concurrency: false }, () => {
  let w: ActivityWorld;
  before(async () => {
    w = await activityWorld();
    // Everyone's access lasts beyond the 400 days the clock moves (made-up data, set directly).
    await w.p.sql(`UPDATE membership SET valid_until = '${utcDatePlusDays(800)}' WHERE space_id = '${w.spaceId}'`);
  });
  after(async () => {
    await setClockOffsetDays(w.p.url, 0);
    await w?.close();
  });

  it('switched on and opened on day 0; at day 400 the row is there and G1 still sees "Last opened on" that day', async () => {
    const day0 = await moveToDay(w, 0);
    await switchOn(w);
    assert.equal((await open(w, A)).status, 200);
    const stored = await viewRows(w);
    assert.deepEqual(stored.map((r) => r.last_opened_on), [day0]);
    for (const day of [30, 181, 365, 400]) {
      await moveToDay(w, day);
      // Requests of every kind on the later day: none of them disposes of anything.
      assert.equal((await open(w, A, String((await w.p.sql(`SELECT id FROM lesson WHERE title = 'Nahw basics'`))[0].id))).status, 200);
      const seen = await guardianSees(w, G1, w.ids[A.username]);
      assert.equal(seen.status, 200, `day ${day}`);
      assert.equal(seen.shown.since, day0);
      assert.equal(seen.shown.subjects.Mathematics['Adding fractions'], day0, `day ${day}: still shown, ${day} days old`);
      assert.ok((await viewRows(w)).some((r) => r.lesson_id === w.content.lesson && r.last_opened_on === day0), `day ${day}: still stored`);
    }
  });
});
