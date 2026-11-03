// AT-12b (contract product-contract-r2, R2-c): publisher and admin see each
// row's history: first publish, then every correction, with previous value,
// new value, who, when, reason. Corrections of a late-joiner row are recorded
// the same way.
//
// "When" is the date and time of the change (YYYY-MM-DD HH:MM, UTC), checked
// against the history row the database holds. The late joiner, E, joins the
// group Science after Quiz 1 was published, is published alone, and corrected.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { utcDatePlusDays } from '../support/http.ts';
import { seed } from '../support/seed.ts';
import { ADMIN } from '../at9/world.ts';
import { publishAll, setScience } from '../at10/marks.ts';
import {
  A, B, C, D, HADEER, adminResultsPath, as, corrected, correctionWorld, historyPath, historyRows, isoMinute, quiz1, stored, storedRows, type CorrectionWorld,
} from './corrections.ts';

const E = { display_name: 'Nour Test', username: 'nour.e', password: 'nour-first-pass', role: 'learner', mobile: '01035353535' };

let w: CorrectionWorld;
let exam = '';
let rows: Awaited<ReturnType<typeof quiz1>>['rows'];

describe('AT-12b publisher and admin see each row\'s history: the first publish, then every correction', { concurrency: false }, () => {
  before(async () => {
    w = await correctionWorld();
    ({ exam, rows } = await quiz1(w));
    await corrected(w, w.hadeer, exam, w.ids[A.username], { mark: '16', reason: 'Question 3 was marked twice' });
    await corrected(w, w.hadeer, exam, w.ids[A.username], { mark: '15.5', reason: 'Half a mark for the diagram' });
    await corrected(w, w.hadeer, exam, w.ids[B.username], { absent: true, reason: 'Was not in the room' });
  });
  after(async () => {
    await w?.close();
  });

  /** The expected history of one row, from the database: [kind, previous, new, who, when, reason]. */
  async function expected(resultId: string): Promise<string[][]> {
    const { history } = await stored(w, resultId);
    const value = (status: unknown, mark: unknown) => (status === null ? '' : status === 'absent' ? 'غائب' : String(Number(mark)));
    return history.map((h) => [
      h.previous_status === null ? 'publish' : 'correction', value(h.previous_status, h.previous_mark), value(h.new_status, h.new_mark),
      HADEER.display_name, isoMinute(Number(h.changed_at)), String(h.reason ?? ''),
    ]);
  }

  for (const [who, path] of [['the publisher (Hadeer)', historyPath], ['the admin', adminResultsPath]] as const) {
    it(`${who}: A\'s row shows the first publish (14), then 14 → 16 and 16 → 15.5, each with who, when and the reason; B\'s shows 11 → Absent; C\'s the publish only`, async () => {
      const c = who === 'the admin' ? w.admin : await as(w, HADEER);
      const res = await c.get(path(w, exam));
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const shown = Object.fromEntries(historyRows(await res.text()).map((r) => [r.learner, r]));
      const entries = (u: string) => shown[w.ids[u]].entries.map((e) => [e.kind, e.previous, e.value, e.who, e.when, e.reason]);
      assert.deepEqual(entries(A.username), await expected(rows[A.username].id));
      assert.deepEqual(entries(A.username).map((e) => e.slice(0, 3).concat(e[5])), [
        ['publish', '', '14', ''], ['correction', '14', '16', 'Question 3 was marked twice'], ['correction', '16', '15.5', 'Half a mark for the diagram'],
      ], 'in order: the first publish, then every correction');
      assert.equal(shown[w.ids[A.username]].current, '15.5 / 20', 'the value now');
      assert.deepEqual(entries(B.username).map((e) => e.slice(0, 3)), [['publish', '', '11'], ['correction', '11', 'غائب']]);
      assert.deepEqual(entries(B.username), await expected(rows[B.username].id));
      for (const u of [C.username, D.username]) assert.deepEqual(entries(u), await expected(rows[u].id), `${u}: the first publish only`);
      assert.equal(entries(C.username).length, 1);
    });
  }

  it('a late joiner: E joins Science after Quiz 1, is published alone, and corrected; her history is recorded the same way', async () => {
    await seed(w.p.url, { spaceId: w.spaceId, grantedBy: ADMIN.username, people: [{ ...E, valid_until: utcDatePlusDays(30) }] });
    const id = String((await w.p.sql(`SELECT id FROM user WHERE username = '${E.username}'`))[0].id);
    w.ids[E.username] = id;
    await setScience(w, [A.username, B.username, C.username, E.username]);
    await publishAll(w, w.hadeer, exam, [E.username], { [E.username]: { mark: '9' } });
    const e = (await storedRows(w, exam))[E.username];
    assert.ok(e.published_at, 'E is published alone');
    await corrected(w, w.hadeer, exam, id, { mark: '10', reason: 'Late paper re-checked' });
    for (const c of [w.hadeer, w.admin]) {
      const path = c === w.admin ? adminResultsPath(w, exam) : historyPath(w, exam);
      const row = historyRows(await (await c.get(path)).text()).find((r) => r.learner === id);
      assert.ok(row, `${path}: E's row`);
      assert.deepEqual(row.entries.map((x) => [x.kind, x.previous, x.value, x.who, x.when, x.reason]), await expected(e.id));
      assert.deepEqual(row.entries.map((x) => [x.kind, x.previous, x.value, x.reason]), [['publish', '', '9', ''], ['correction', '9', '10', 'Late paper re-checked']]);
    }
  });
});
