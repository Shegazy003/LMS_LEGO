// AT-11c (contract product-contract-r2, R2-b learner view): a learner removed
// from the subject or group after publishing keeps seeing the results already
// published (they are the learner's own record). Rows are never shown for
// later exams.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { A, B, C, D, as, assignMath, createExam, publishAll, resultsWorld, setScience, shownRows, storedRows, marksPath } from '../at10/marks.ts';

let w: Awaited<ReturnType<typeof resultsWorld>>;

describe('AT-11c a learner who leaves keeps their published results, and gets no row for later exams', { concurrency: false }, () => {
  before(async () => {
    w = await resultsWorld();
  });
  after(async () => {
    await w?.close();
  });

  it('A leaves the group Science and D loses her direct place: each still sees the result already published', async () => {
    await setScience(w, [B.username, C.username]);
    await assignMath(w, w.science, []);
    for (const [learner, score] of [[A, '17 / 20'], [D, '15.5 / 20']] as const) {
      const c = await as(w, learner);
      const home = await (await c.get(`/s/${w.spaceId}`)).text();
      assert.ok(!home.includes(`/learn/${w.content.math}`), `${learner.username} no longer reads Mathematics (the change is real)`);
      const html = await (await c.get(`/s/${w.spaceId}/results`)).text();
      assert.ok(html.includes('Mid-term') && html.includes(score), `${learner.username} still sees ${score}`);
      const one = await c.get(`/s/${w.spaceId}/results/${w.published[learner.username].id}`);
      assert.equal(one.status, 200, `${learner.username}: the result's own page too`);
    }
  });

  it('a later exam lists only the learners of the subject now; A and D get no row and see nothing of it', async () => {
    const later = await createExam(w, w.hadeer, w.content.math, { title: 'End of term', exam_date: '2026-12-10', max_mark: '20' });
    const rows = shownRows(await (await w.hadeer.get(marksPath(w, later))).text());
    assert.deepEqual(rows.map((r) => r.learner), [C, B].map((p) => w.ids[p.username]), 'the later list: C and B');
    await publishAll(w, w.hadeer, later, [C.username, B.username], { [C.username]: { mark: '14' }, [B.username]: { mark: '18' } });
    const stored = await storedRows(w, later);
    assert.deepEqual(Object.keys(stored).sort(), [B.username, C.username].sort(), 'no row for A or D');
    for (const learner of [A, D]) {
      const html = await (await (await as(w, learner)).get(`/s/${w.spaceId}/results`)).text();
      assert.ok(!html.includes('End of term'), `${learner.username}: nothing of the later exam`);
      assert.equal([...html.matchAll(/class="card result"/g)].length, 1, `${learner.username}: still exactly one row`);
    }
    const b = await (await (await as(w, B)).get(`/s/${w.spaceId}/results`)).text();
    assert.ok(b.includes('End of term') && b.includes('18 / 20') && b.includes('غائب'), 'B sees both of hers');
  });
});
