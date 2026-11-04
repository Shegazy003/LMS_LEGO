// AT-15i (contract product-contract-r2, R2-d): a log failure never blocks
// learning. A fault injected into the view-row write still opens the lesson
// for the learner; the failure is logged without names, lesson titles, or any
// lesson id and learner id together. The fault is injected into the real
// router run in this process (test/support/in-process.ts): the lesson-view
// statement fails.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { startInProcess, type InProcessWorker } from '../support/in-process.ts';
import { A, ADMIN, B, G1, HADEER } from '../at9/world.ts';

describe('AT-15i a fault in the lesson-view write still opens the lesson, and its log line names nobody and nothing', { concurrency: false }, () => {
  let p: InProcessWorker;
  let spaceId = '';
  let lesson = '';
  const ids: Record<string, string> = {};
  const rows = () => p.sqlite.prepare('SELECT * FROM lesson_view').all();

  before(async () => {
    p = await startInProcess();
    const owner = await setUpOwner(p.url);
    spaceId = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const s = await seed(p.url, {
      spaceId, grantedBy: ADMIN.username,
      people: [HADEER, A, B, { ...G1, role: 'guardian' }].map((x) => ({ ...x, valid_until: utcDatePlusDays(30) })),
      links: [{ guardian: G1.username, learner: A.username }],
      subjects: [{ title: 'Mathematics', publisher: HADEER.username, published: true, users: [A.username, B.username], chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions', body: 'Add the tops.' }] }] }],
    });
    Object.assign(ids, s.users);
    lesson = s.subjects.Mathematics.chapters.Fractions.lessons['Adding fractions'].id;
    const admin = await signedIn(p.url, ADMIN.username, ADMIN.password);
    assert.equal((await admin.post(`/s/${spaceId}/admin/activity`, { told: '1' })).status, 303, 'switched on');
  });
  after(() => p?.stop());

  it('the write fails: the learner still gets the lesson (200, with its title and the notice), nothing is stored, and one fixed log line is written', async () => {
    let failed = 0;
    p.setHooks({
      rewrite(s, params) {
        if (/^\s*INSERT INTO lesson_view\b/.test(s)) {
          failed++;
          throw new Error(`injected fault: lesson_view write for ${params.join(' ')} (Salma Test, Adding fractions)`);
        }
        return [s, params];
      },
    });
    p.clearLog();
    const a = await signedIn(p.url, A.username, A.password);
    const res = await a.get(`/s/${spaceId}/read/${lesson}`);
    await p.settle();
    p.setHooks({});
    assert.equal(failed, 1, 'the fault was injected into the view-row write');
    assert.equal(res.status, 200, 'the lesson opens');
    const html = await res.text();
    assert.ok(html.includes('id="lesson-title"') && html.includes('Adding fractions') && html.includes('Add the tops.'), 'the whole lesson is served');
    assert.ok(html.includes('id="activity-notice"'), 'with the notice');
    assert.deepEqual(rows(), [], 'nothing stored');
    const log = p.log();
    assert.deepEqual(log, [JSON.stringify({ event: 'activity write failed' })], 'exactly one line, the fixed event alone');
    for (const secret of [ids[A.username], lesson, 'Salma Test', 'Adding fractions', A.username, spaceId]) {
      assert.ok(!log.join('\n').includes(secret), `the log carries no ${secret}`);
    }
  });

  it('without the fault the same open is recorded, and nothing is logged', async () => {
    p.clearLog();
    const b = await signedIn(p.url, B.username, B.password);
    assert.equal((await b.get(`/s/${spaceId}/read/${lesson}`)).status, 200);
    await p.settle();
    assert.equal(rows().length, 1);
    assert.deepEqual(p.log(), []);
  });
});
