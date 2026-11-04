// AT-12e (contract product-contract-r2, R2-c): the history table rejects
// UPDATE and DELETE at the database (trigger); a test that tries both must
// fail. A correction that writes the new value but fails to write history
// leaves zero changes (atomic).
//
// Part 1 runs the product as CI does (workerd and D1) and tries both, by
// hand, on history rows that hold corrections. Part 2 injects the fault into
// the real router run in this process (test/support/in-process.ts): the
// correction's statement that writes the new value runs, then its history
// statement fails; the result row and the history are exactly as before.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { startInProcess, type InProcessWorker } from '../support/in-process.ts';
import { ADMIN, HADEER as HADEER_P } from '../at9/world.ts';
import { MATH_ORDER, type World } from '../at10/marks.ts';
import { A, B, C, D, HADEER, corrected, correctPath, correctionForm, correctionWorld, openCorrection, publishAll, quiz1, stored, type CorrectionWorld } from './corrections.ts';

describe('AT-12e the history refuses UPDATE and DELETE at the database, also on correction rows', { concurrency: false }, () => {
  let w: CorrectionWorld;
  before(async () => {
    w = await correctionWorld();
    const { exam } = await quiz1(w);
    await corrected(w, w.hadeer, exam, w.ids[A.username], { mark: '16', reason: 'Question 3 was marked twice' });
  });
  after(async () => {
    await w?.close();
  });

  it('UPDATE of a correction row, of every row, and DELETE of one and of all are each refused; the rows are unchanged', async () => {
    const all = async () => (await w.p.sql('SELECT id, result_id, previous_status, previous_mark, new_status, new_mark, reason, changed_by, changed_at FROM exam_result_history ORDER BY id')).map((r) => JSON.stringify(r));
    const before = await all();
    assert.ok(before.length >= 9, `publish rows and the correction (${before.length})`);
    const correction = String((await w.p.sql('SELECT id FROM exam_result_history WHERE previous_status IS NOT NULL'))[0].id);
    for (const sql of [
      `UPDATE exam_result_history SET reason = 'rewritten' WHERE id = '${correction}'`,
      `UPDATE exam_result_history SET new_mark = 20 WHERE id = '${correction}'`,
      'UPDATE exam_result_history SET new_mark = 0',
      `DELETE FROM exam_result_history WHERE id = '${correction}'`,
      'DELETE FROM exam_result_history',
    ]) {
      await assert.rejects(w.p.sql(sql), /append-only/, sql);
    }
    assert.deepEqual(await all(), before, 'every history row as it was');
  });
});

describe('AT-12e atomic: a correction whose history write fails leaves zero changes', { concurrency: false }, () => {
  let p: InProcessWorker;
  let spaceId = '';
  let hadeer: Client;
  let exam = '';
  let ids: Record<string, string> = {};
  const sql = (q: string) => p.sqlite.prepare(q).all() as Record<string, unknown>[];

  before(async () => {
    p = await startInProcess();
    const owner = await setUpOwner(p.url);
    spaceId = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const until = utcDatePlusDays(30);
    await seed(p.url, {
      spaceId, grantedBy: ADMIN.username,
      people: [HADEER_P, A, B, C, D].map((x) => ({ ...x, valid_until: until })),
      groups: [{ name: 'Science', members: [A.username, B.username, C.username, D.username] }],
      subjects: [{ title: 'Mathematics', publisher: HADEER.username, published: true, groups: ['Science'] }],
    });
    hadeer = await signedIn(p.url, HADEER.username, HADEER.password);
    const subject = String(sql(`SELECT id FROM subject WHERE title = 'Mathematics'`)[0].id);
    const res = await hadeer.post(`/s/${spaceId}/publish/edit/${subject}/marks`, { title: 'Quiz 1', exam_date: '2026-11-05', max_mark: '20' });
    assert.equal(res.status, 303);
    exam = (res.headers.get('location') ?? '').split('/').pop() ?? '';
    ids = Object.fromEntries(sql('SELECT id, username FROM user').map((r) => [String(r.username), String(r.id)]));
    await publishAll({ ids, spaceId } as unknown as World, hadeer, exam, MATH_ORDER.map((x) => x.username), {
      [A.username]: { mark: '14' }, [B.username]: { mark: '11' }, [C.username]: { mark: '12' }, [D.username]: { mark: '15' },
    });
  });
  after(() => p?.stop());

  it('the new value is written, then the history row fails: the answer is an error, and the result and the history are exactly as before', async () => {
    const w = { spaceId };
    const page = await openCorrection(w, hadeer, exam, ids[A.username]);
    assert.equal(page.status, 200);
    const results = () => sql('SELECT id, status, mark, published_at, changed_by, changed_at FROM exam_result ORDER BY id');
    const history = () => sql('SELECT id, result_id, previous_status, previous_mark, new_status, new_mark, reason, changed_by, changed_at FROM exam_result_history ORDER BY id');
    const before = { results: results(), history: history() };
    const seen: string[] = [];
    let failed = false;
    p.setHooks({
      rewrite(s, params) {
        if (/^\s*UPDATE exam_result SET/.test(s)) seen.push('the new value');
        if (/^\s*INSERT INTO exam_result_history/.test(s)) {
          seen.push('the history row');
          failed = true;
          throw new Error('injected fault: the history row cannot be written');
        }
        return [s, params];
      },
    });
    const res = await hadeer.post(correctPath(w, exam), correctionForm(ids[A.username], { mark: '16', reason: 'Question 3 was marked twice', version: page.version }));
    p.setHooks({});
    assert.ok(failed, 'the fault was injected');
    assert.deepEqual(seen, ['the new value', 'the history row'], 'the new value is written first, in the same batch, then the history row fails');
    assert.equal(res.status, 500, 'the publisher is told it failed');
    assert.deepEqual(results(), before.results, 'zero result rows changed');
    assert.deepEqual(history(), before.history, 'zero history rows written');

    // Without the fault the same correction goes through: the value and one history row.
    const again = await hadeer.post(correctPath(w, exam), correctionForm(ids[A.username], { mark: '16', reason: 'Question 3 was marked twice', version: page.version }));
    assert.equal(again.status, 303);
    const a = sql(`SELECT id, mark FROM exam_result WHERE learner_user_id = '${ids[A.username]}'`)[0];
    assert.equal(Number(a.mark), 16);
    assert.equal(history().length, before.history.length + 1);
  });

  it('a second tab sending the same correction again changes nothing and says so', async () => {
    const w = { spaceId };
    const page = await openCorrection(w, hadeer, exam, ids[B.username]);
    const form = () => correctionForm(ids[B.username], { mark: '13', reason: 'Re-added page 2', version: page.version });
    assert.equal((await hadeer.post(correctPath(w, exam), form())).status, 303, 'the first tab corrects');
    const count = Number(sql('SELECT COUNT(*) AS n FROM exam_result_history')[0].n);
    const second = await hadeer.post(correctPath(w, exam), form());
    assert.equal(second.status, 409, 'the second tab is told the row changed meanwhile');
    assert.equal(Number(sql('SELECT COUNT(*) AS n FROM exam_result_history')[0].n), count, 'no second history row');
    const b = sql(`SELECT id FROM exam_result WHERE learner_user_id = '${ids[B.username]}'`)[0];
    const { history } = await stored({ p: { sql: async (q: string) => sql(q) } }, String(b.id));
    assert.deepEqual(history.map((h) => [h.previous_mark === null ? null : Number(h.previous_mark), Number(h.new_mark)]), [[null, 11], [11, 13]]);
  });
});
