// AT-10f (contract product-contract-r2, R2-b): Publish is atomic and writes,
// per row, a history row (previous = none, new value, publisher, time). A
// plain link (GET) never publishes. A second tab pressing Publish again
// changes nothing and shows a plain message. A learner who joins later appears
// as a new empty row and can be published alone.
//
// "Atomic" (section 3): a fault injected in the middle of the action leaves
// zero rows changed. The fault is injected into the real router run in this
// process (test/support/in-process.ts): the third row's history statement
// fails inside the publish batch.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { startInProcess, type InProcessWorker } from '../support/in-process.ts';
import { ADMIN, HADEER as HADEER_P } from '../at9/world.ts';
import {
  A, B, C, D, HADEER, MATH_ORDER, as, confirmFields, confirmForm, count, createExam, marksPath, marksWorld, pressPublish, publishAll, setScience,
  shownRows, storedRows, type World,
} from './marks.ts';

const everyone = MATH_ORDER.map((p) => p.username);
const values = { [C.username]: { mark: '12' }, [D.username]: { mark: '15,5' }, [A.username]: { mark: '17' }, [B.username]: { absent: true } };
const E = { display_name: 'Nour Test', username: 'nour.e', password: 'nour-first-pass', role: 'learner', mobile: '01035353535' };

describe('AT-10f atomic: a fault in the middle of Publish leaves zero rows changed', { concurrency: false }, () => {
  let p: InProcessWorker;
  let spaceId = '';
  let hadeer: Client;
  let exam = '';
  const sql = (q: string) => p.sqlite.prepare(q).all() as Record<string, unknown>[];
  const n = (q: string) => Number(sql(q)[0].n);

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
    const res = await hadeer.post(`/s/${spaceId}/publish/edit/${subject}/marks`, { title: 'Mid-term', exam_date: '2026-11-12', max_mark: '20' });
    assert.equal(res.status, 303);
    exam = (res.headers.get('location') ?? '').split('/').pop() ?? '';
  });
  after(() => p?.stop());

  it('the third row\'s history write fails: the answer is an error, and no result is published and no history row is written', async () => {
    const ids = Object.fromEntries(sql('SELECT id, username FROM user').map((r) => [String(r.username), String(r.id)]));
    const world = { ids, spaceId } as unknown as World;
    const step = await pressPublish(world, hadeer, exam, everyone, values);
    assert.equal(step.status, 200, 'the confirmation');
    const fields = confirmFields(step.html)!;
    const before = sql(`SELECT id, status, mark, published_at, changed_by, changed_at FROM exam_result ORDER BY id`);
    assert.equal(before.length, 4, 'four draft rows');
    let histories = 0;
    let failed = false;
    p.setHooks({
      rewrite(s, params) {
        if (/^\s*INSERT INTO exam_result_history/.test(s) && ++histories === 3) {
          failed = true;
          throw new Error('injected fault: the third history row cannot be written');
        }
        return [s, params];
      },
    });
    const res = await hadeer.post(`/s/${spaceId}/publish/marks/${exam}/publish`, confirmForm(fields));
    p.setHooks({});
    assert.ok(failed, 'the fault was injected in the middle of the batch (after two rows)');
    assert.equal(res.status, 500, 'the publisher is told it failed');
    assert.deepEqual(sql(`SELECT id, status, mark, published_at, changed_by, changed_at FROM exam_result ORDER BY id`), before, 'zero result rows changed');
    assert.equal(n('SELECT COUNT(*) AS n FROM exam_result WHERE published_at IS NOT NULL'), 0);
    assert.equal(n('SELECT COUNT(*) AS n FROM exam_result_history'), 0, 'zero history rows');

    // Without the fault the same confirmation publishes every row, each with its history row.
    const again = await hadeer.post(`/s/${spaceId}/publish/marks/${exam}/publish`, confirmForm(fields));
    assert.equal(again.status, 303);
    assert.equal(n('SELECT COUNT(*) AS n FROM exam_result WHERE published_at IS NOT NULL'), 4);
    assert.equal(n('SELECT COUNT(*) AS n FROM exam_result_history'), 4);
  });
});

describe('AT-10f the running product: history per row, a plain link never publishes, a second tab changes nothing, a late joiner alone', { concurrency: false }, () => {
  let w: World & { science: string };
  let exam = '';
  before(async () => {
    w = await marksWorld();
    exam = await createExam(w, await as(w, HADEER), w.content.math, { title: 'Mid-term', max_mark: '20' });
  });
  after(async () => {
    await w?.close();
  });

  it('a plain link (GET) never publishes: not the confirming address, not the marks page with any query', async () => {
    const hadeer = await as(w, HADEER);
    const step = await pressPublish(w, hadeer, exam, everyone, values);
    assert.equal(step.status, 200);
    for (const path of [`${marksPath(w, exam)}/publish`, `${marksPath(w, exam)}?action=publish`, `${marksPath(w, exam)}/publish?version=${confirmFields(step.html)!.version}`]) {
      const res = await hadeer.get(path);
      assert.ok([200, 404].includes(res.status), `GET ${path} (${res.status})`);
    }
    assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result WHERE published_at IS NOT NULL'), 0, 'nothing published');
    assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result_history'), 0);
  });

  it('two tabs on the confirmation: the first publishes every row with its history row; the second changes nothing and says so plainly', async () => {
    const hadeer = await as(w, HADEER);
    const tab1 = confirmFields((await pressPublish(w, hadeer, exam, everyone, values)).html)!;
    const tab2 = confirmFields((await pressPublish(w, hadeer, exam, everyone, values)).html)!;
    assert.equal(tab1.version, tab2.version, 'both tabs show the same list');
    const first = await hadeer.post(`${marksPath(w, exam)}/publish`, confirmForm(tab1));
    assert.equal(first.status, 303);
    const published = await storedRows(w, exam);
    assert.ok(everyone.every((u) => published[u].published_at !== null), 'every row published');
    const hadeerId = w.ids[HADEER.username];
    const history = await w.p.sql(`SELECT h.result_id, h.previous_status, h.previous_mark, h.new_status, h.new_mark, h.reason, h.changed_by, h.changed_at, r.published_at
      FROM exam_result_history h JOIN exam_result r ON r.id = h.result_id ORDER BY h.result_id`);
    assert.equal(history.length, 4, 'one history row per result');
    for (const h of history) {
      const mine = Object.values(published).find((r) => r.id === h.result_id)!;
      assert.equal(h.previous_status, null, 'previous = none');
      assert.equal(h.previous_mark, null);
      assert.equal(h.new_status, mine.status, 'the new value');
      assert.equal(h.new_mark === null ? null : Number(h.new_mark), mine.mark);
      assert.equal(h.reason, null);
      assert.equal(h.changed_by, hadeerId, 'the publisher');
      assert.equal(Number(h.changed_at), Number(h.published_at), 'the time');
    }
    const second = await hadeer.post(`${marksPath(w, exam)}/publish`, confirmForm(tab2));
    assert.equal(second.status, 409);
    const body = await second.text();
    assert.match(body, /id="marks-message" class="message">هذه الدرجات منشورة بالفعل. لم يتغيّر شيء.</, 'a plain message');
    assert.deepEqual(await storedRows(w, exam), published, 'nothing changed');
    assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result_history'), 4, 'no second history row');
  });

  it('the history refuses UPDATE and DELETE at the database', async () => {
    await assert.rejects(w.p.sql('UPDATE exam_result_history SET new_mark = 0'), /append-only/);
    await assert.rejects(w.p.sql('DELETE FROM exam_result_history'), /append-only/);
    assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result_history'), 4);
  });

  it('E joins later: she appears as a new empty row, the published rows stay as they are, and she is published alone', async () => {
    const hadeer = await as(w, HADEER);
    const before = await storedRows(w, exam);
    assert.equal((await w.admin.post(`/s/${w.spaceId}/admin/people`, { ...E, valid_until: utcDatePlusDays(30) })).status, 303);
    w.ids[E.username] = String((await w.p.sql(`SELECT id FROM user WHERE username = '${E.username}'`))[0].id);
    await setScience(w, [A.username, B.username, C.username, E.username]);
    const rows = shownRows(await (await hadeer.get(marksPath(w, exam))).text());
    const order = [E, C, D, A, B].map((p) => p.username);
    assert.deepEqual(rows.map((r) => r.learner), order.map((u) => w.ids[u]), 'Nour Test sorts first');
    assert.deepEqual(rows.map((r) => r.published), [false, true, true, true, true], 'only E is open');
    assert.equal(rows[0].typed, '');
    const step = await pressPublish(w, hadeer, exam, order, { [E.username]: { mark: '19' } });
    assert.equal(step.status, 200);
    assert.deepEqual(shownRows(step.html).map((r) => r.learner), [w.ids[E.username]], 'the confirmation lists E alone');
    await publishAll(w, hadeer, exam, order, { [E.username]: { mark: '19' } });
    const after = await storedRows(w, exam);
    assert.equal(after[E.username].mark, 19);
    assert.notEqual(after[E.username].published_at, null);
    for (const u of everyone) assert.deepEqual(after[u], before[u], `${u} unchanged`);
    assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result_history'), 5, 'one more history row, for E');
  });
});
