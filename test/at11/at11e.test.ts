// AT-11e (contract product-contract-r2, R2-c admin and publisher views): the
// admin sees all results of the space; a publisher sees all rows of their own
// subjects and nothing of others. A person in another space sees nothing.
//
// The admin's view: /s/<space>/admin/results (every exam of the space with a
// published row) and one exam's page (every published row, with its history).
// The publisher's view: the history page of each of their own exams
// (/s/<space>/publish/marks/<exam>/history), reached from the marks page.
// Drafts are seen by nobody but their publisher (R2-b), so neither view shows
// one. Refusals are identical for an existing and a non-existing target.
// Driven in Chromium at phone width, Arabic then English; screenshots go to
// evidence/at-11/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, follow, phone, readable, shot, signIn } from '../support/browser.ts';
import { signedIn } from '../support/seed.ts';
import { ADMIN, KARIM, OTHER_ADMIN } from '../at9/world.ts';
import {
  A, B, C, D, G1, HADEER, SHIMAA, adminResultsPath, as, correctionWorld, historyPath, historyRows, marksPath, type CorrectionWorld,
} from '../at12/corrections.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-11/', import.meta.url));
const MID_TERM = (w: CorrectionWorld) => ({
  [w.ids[C.username]]: '12', [w.ids[D.username]]: '15.5', [w.ids[A.username]]: '17', [w.ids[B.username]]: 'غائب',
});

let w: CorrectionWorld;
let browser: Browser;

async function answer(c: Awaited<ReturnType<typeof as>>, path: string) {
  const res = await c.get(path);
  return { status: res.status, body: await res.text(), cacheControl: res.headers.get('cache-control') };
}

describe('AT-11e the admin sees all results of the space; a publisher sees their own subjects only; another space sees nothing', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await correctionWorld();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('the admin: the results list names the published Mid-term and not the draft-only Quiz 2; its page lists every row, each with its value', async () => {
    const list = await answer(w.admin, adminResultsPath(w));
    assert.equal(list.status, 200);
    assert.equal(list.cacheControl, 'no-store');
    assert.ok(list.body.includes('Mid-term') && list.body.includes('Mathematics'), 'Mid-term of Mathematics is listed');
    assert.ok(list.body.includes(`href="${adminResultsPath(w, w.exam)}"`), 'with its own page');
    assert.ok(!list.body.includes('Quiz 2') && !list.body.includes(w.draftExam), 'an exam with drafts only is not listed');
    const page = await answer(w.admin, adminResultsPath(w, w.exam));
    assert.equal(page.status, 200);
    assert.equal(page.cacheControl, 'no-store');
    const rows = historyRows(page.body);
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.learner, r.current])), Object.fromEntries(Object.entries(MID_TERM(w)).map(([k, v]) => [k, v === 'غائب' ? v : `${v} / 20`])));
    assert.deepEqual(rows.map((r) => r.name), [C, D, A, B].map((p) => p.display_name), 'by name, then username');
    // The draft exam's page shows no row: a draft is the publisher's only.
    const draft = await answer(w.admin, adminResultsPath(w, w.draftExam));
    assert.deepEqual(historyRows(draft.body), [], 'no draft row');
    assert.ok(!draft.body.includes('9 / 10') && !draft.body.includes('>9<'), 'the draft value is not shown');
  });

  it('the admin home leads to the results list', async () => {
    const home = await (await w.admin.get(`/s/${w.spaceId}/admin`)).text();
    assert.ok(home.includes(`href="${adminResultsPath(w)}"`), 'a way to the results from the admin home');
  });

  it('Hadeer sees every row of her own exam on its history page; Shimaa\'s exam and a non-existing one are refused identically', async () => {
    const hadeer = await as(w, HADEER);
    const marks = await (await hadeer.get(marksPath(w, w.exam))).text();
    assert.ok(marks.includes(`href="${historyPath(w, w.exam)}"`), 'the marks page leads to the history page');
    const own = await answer(hadeer, historyPath(w, w.exam));
    assert.equal(own.status, 200);
    assert.equal(own.cacheControl, 'no-store');
    assert.equal(historyRows(own.body).length, 4, 'every row of her subject');
    const none = await answer(hadeer, historyPath(w, 'no-such-exam'));
    assert.equal(none.status, 403);
    const shimaas = await answer(hadeer, historyPath(w, w.draftExam));
    assert.deepEqual([shimaas.status, shimaas.body], [none.status, none.body], 'Shimaa\'s exam: the same answer as one that does not exist');

    const shimaa = await as(w, SHIMAA);
    const theirs = await answer(shimaa, historyPath(w, w.exam));
    const nothing = await answer(shimaa, historyPath(w, 'no-such-exam'));
    assert.deepEqual([theirs.status, theirs.body], [nothing.status, nothing.body], 'Shimaa gets nothing of Hadeer\'s exam');
    assert.ok(!theirs.body.includes('17 / 20') && !theirs.body.includes(A.display_name), 'not a mark, not a name');
  });

  it('a learner, a guardian and the publisher cannot open the admin\'s results, existing exam or not', async () => {
    for (const person of [A, G1, HADEER]) {
      const c = await as(w, person);
      const none = await answer(c, adminResultsPath(w, 'no-such-exam'));
      for (const path of [adminResultsPath(w), adminResultsPath(w, w.exam)]) {
        const r = await answer(c, path);
        assert.deepEqual([r.status, r.body], [none.status, none.body], `${person.username} ${path}: refused identically`);
        assert.equal(r.status, 403);
      }
    }
  });

  it('a person in another space sees nothing: the other admin and Karim, under either address', async () => {
    const other = await signedIn(w.p.url, OTHER_ADMIN.username, OTHER_ADMIN.password);
    const karim = await as(w, KARIM);
    for (const c of [other, karim]) {
      for (const path of [
        adminResultsPath(w), adminResultsPath(w, w.exam), historyPath(w, w.exam), `/s/${w.spaceId}/linked/${w.ids[A.username]}`, `/s/${w.spaceId}/results`,
        `/s/${w.otherSpaceId}/admin/results/${w.exam}`, `/s/${w.otherSpaceId}/publish/marks/${w.exam}/history`,
      ]) {
        const r = await answer(c, path);
        assert.ok(r.status === 403, `${path}: refused (${r.status})`);
        for (const value of ['17 / 20', '12 / 20', '15.5 / 20', A.display_name, 'Mid-term']) assert.ok(!r.body.includes(value), `${path}: no ${value}`);
      }
    }
    // The other admin's own results list is empty of this space.
    const own = await answer(other, `/s/${w.otherSpaceId}/admin/results`);
    assert.equal(own.status, 200);
    assert.ok(!own.body.includes('Mid-term'), 'another space\'s list holds nothing of this one');
  });

  it('in a real browser at phone width: the admin goes from the admin home to the Mid-term rows, Arabic then English', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, ADMIN.username, ADMIN.password);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}/admin`);
    await follow(ph.page, '#admin-results');
    await assertPage(ph.page, 'the results list (Arabic)', 'ar');
    await follow(ph.page, `a[href="${adminResultsPath(w, w.exam)}"]`);
    await assertPage(ph.page, 'the Mid-term rows (Arabic)', 'ar');
    const ar = await readable(ph.page);
    assert.ok(ar.includes(A.display_name) && ar.includes('17 / 20') && ar.includes('15.5 / 20'), 'names and values');
    await shot(ph.page, EVIDENCE, '11e-1-admin-results-ar');
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + adminResultsPath(w, w.exam));
    await assertPage(ph.page, 'the Mid-term rows (English)', 'en');
    assert.ok((await readable(ph.page)).includes('Absent'));
    await shot(ph.page, EVIDENCE, '11e-2-admin-results-en');
    await ph.ctx.close();

    const pub = await phone(browser);
    await signIn(w.p.url, pub.page, HADEER.username, HADEER.password);
    await pub.page.goto(w.p.url + marksPath(w, w.exam));
    await follow(pub.page, '#history-link');
    await assertPage(pub.page, 'the publisher\'s history page (Arabic)', 'ar');
    await shot(pub.page, EVIDENCE, '11e-3-publisher-history-ar');
    await pub.ctx.close();
  });
});
