// AT-11d (contract product-contract-r2, R2-c guardian view): G1 sees A's and
// B's results labelled with the learner name; G2 sees A only; nothing for
// unlinked learners. Removing a link or ending access hides at once ("at
// once": on the next request, in a session already open).
//
// A guardian reads a learner's results on that learner's page
// (/s/<space>/linked/<learner>), reached from the guardian home, in a section
// headed with the learner's name. Drafts never appear. A page for a learner
// the viewer may not see is refused identically (same status, same bytes) for
// an existing and a non-existing target. Driven in Chromium at phone width,
// Arabic first, then English; screenshots go to evidence/at-11/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, follow, phone, readable, shot, signIn } from '../support/browser.ts';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { A, B, C, D, G1, G2, as, correctionWorld, guardianResults, linkedPath, personPath, type CorrectionWorld } from '../at12/corrections.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-11/', import.meta.url));

let w: CorrectionWorld;
let browser: Browser;

async function refusal(c: Awaited<ReturnType<typeof as>>, path: string) {
  const res = await c.get(path);
  return { status: res.status, body: await res.text() };
}

describe('AT-11d a guardian sees the results of exactly their linked learners, each labelled with the learner\'s name', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await correctionWorld();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('G1: A\'s page shows "Results: Salma Test" with Mid-term 17 / 20; B\'s page shows Youssef\'s Absent; no draft, nobody else', async () => {
    const g1 = await as(w, G1);
    const a = await g1.get(linkedPath(w, A.username));
    assert.equal(a.status, 200);
    assert.equal(a.headers.get('cache-control'), 'no-store');
    const aHtml = await a.text();
    const aResults = guardianResults(aHtml);
    assert.ok(aResults, 'A\'s page has a results section');
    assert.ok(aResults.heading.includes(A.display_name), `labelled with the learner name: ${aResults.heading}`);
    assert.deepEqual(aResults.cards.map((c) => [c.exam, c.subject, c.date, c.score, c.corrected]), [['Mid-term', 'Mathematics', '2026-11-12', '17 / 20', '']]);
    assert.ok(!aHtml.includes('Quiz 2') && !aHtml.includes('9 / 10'), 'A\'s Arabic draft never appears');

    const bHtml = await (await g1.get(linkedPath(w, B.username))).text();
    const bResults = guardianResults(bHtml);
    assert.ok(bResults?.heading.includes(B.display_name), 'labelled with B\'s name');
    assert.deepEqual(bResults.cards.map((c) => [c.exam, c.score]), [['Mid-term', 'غائب']]);
    for (const html of [aHtml, bHtml]) {
      for (const other of [C, D]) assert.ok(!html.includes(other.username), `nothing of ${other.username}`);
      for (const mark of ['12 / 20', '15.5 / 20']) assert.ok(!html.includes(mark), `no other learner's mark ${mark}`);
    }
    assert.ok(!aHtml.includes('غائب'), 'B\'s Absent is not on A\'s page');
    assert.ok(!bHtml.includes('17 / 20'), 'A\'s mark is not on B\'s page');
  });

  it('G2 sees A\'s results only; B\'s page and C\'s page are refused identically to a page that does not exist', async () => {
    const g2 = await as(w, G2);
    const a = await g2.get(linkedPath(w, A.username));
    assert.equal(a.status, 200);
    assert.deepEqual(guardianResults(await a.text())?.cards.map((c) => c.score), ['17 / 20']);
    const none = await refusal(g2, `/s/${w.spaceId}/linked/no-such-learner`);
    assert.equal(none.status, 403);
    for (const who of [B, C, D]) {
      const r = await refusal(g2, linkedPath(w, who.username));
      assert.equal(r.status, none.status, `${who.username}: the same status`);
      assert.equal(r.body, none.body, `${who.username}: the same bytes`);
      assert.ok(!r.body.includes('/ 20') && !r.body.includes('غائب'), `${who.username}: no result`);
    }
    const g1 = await as(w, G1);
    for (const who of [C, D]) assert.equal((await refusal(g1, linkedPath(w, who.username))).body, (await refusal(g1, `/s/${w.spaceId}/linked/no-such-learner`)).body, `G1: nothing for unlinked ${who.username}`);
  });

  it('removing the link G1-B hides B\'s results at once, in G1\'s open session; restoring brings them back', async () => {
    const g1 = await as(w, G1);
    assert.equal((await g1.get(linkedPath(w, B.username))).status, 200, 'B\'s results are shown before');
    const guardian = personPath(w, w.ids[G1.username]);
    assert.equal((await w.admin.post(`${guardian}/links/${w.ids[B.username]}/remove`, {})).status, 303, 'the admin removes the link');
    const after = await refusal(g1, linkedPath(w, B.username));
    assert.equal(after.status, 403, 'refused on the very next request');
    assert.equal(after.body, (await refusal(g1, `/s/${w.spaceId}/linked/no-such-learner`)).body, 'identically');
    const home = await (await g1.get(`/s/${w.spaceId}/linked`)).text();
    assert.ok(!home.includes(B.display_name), 'B is gone from the guardian home');
    assert.equal((await w.admin.post(`${guardian}/links`, { learner: w.ids[B.username] })).status, 303, 'the admin restores the link');
    assert.deepEqual(guardianResults(await (await g1.get(linkedPath(w, B.username))).text())?.cards.map((c) => c.score), ['غائب'], 'back, unchanged');
  });

  it('ending A\'s access hides A\'s results from G1 and G2 at once; ending G1\'s access hides everything from G1; restoring brings them back', async () => {
    const g1 = await as(w, G1);
    const g2 = await as(w, G2);
    assert.equal((await w.admin.post(`${personPath(w, w.ids[A.username])}/end`, {})).status, 303, 'End access now for A');
    for (const [who, c] of [['G1', g1], ['G2', g2]] as const) {
      const r = await refusal(c, linkedPath(w, A.username));
      assert.equal(r.status, 403, `${who}: A refused at once`);
      assert.ok(!r.body.includes('17 / 20'), `${who}: no result of A`);
    }
    assert.equal((await w.admin.post(`${personPath(w, w.ids[A.username])}/restore`, { valid_until: utcDatePlusDays(20) })).status, 303, 'Restore A');
    assert.equal((await g1.get(linkedPath(w, A.username))).status, 200, 'A is back for G1');

    assert.equal((await w.admin.post(`${personPath(w, w.ids[G1.username])}/end`, {})).status, 303, 'End access now for G1');
    const fresh = await as(w, G2);
    assert.equal((await fresh.get(linkedPath(w, A.username))).status, 200, 'G2 is unaffected');
    const ended = new Client(w.p.url);
    const signin = await ended.post('/signin', { username: G1.username, password: G1.password });
    assert.notEqual(signin.status, 500);
    for (const path of [linkedPath(w, A.username), linkedPath(w, B.username), `/s/${w.spaceId}/linked`]) {
      const r = await refusal(ended, path);
      assert.ok(r.status === 403 || r.status === 302, `${path}: refused (${r.status})`);
      assert.ok(!r.body.includes('17 / 20') && !r.body.includes('غائب'), `${path}: no result`);
    }
    assert.equal((await w.admin.post(`${personPath(w, w.ids[G1.username])}/restore`, { valid_until: utcDatePlusDays(20) })).status, 303, 'Restore G1');
  });

  it('in a real browser at phone width: G1 goes from the guardian home to A\'s results, Arabic then English', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, G1.username, G1.password);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}/linked`);
    await follow(ph.page, `section[data-learner="${w.ids[A.username]}"] a.learner`);
    await assertPage(ph.page, 'A\'s page (Arabic)', 'ar');
    const ar = await readable(ph.page);
    assert.ok(ar.includes(A.display_name) && ar.includes('17 / 20') && ar.includes('Mid-term'), 'the name and the result');
    await shot(ph.page, EVIDENCE, '11d-1-guardian-results-ar');
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + linkedPath(w, B.username));
    await assertPage(ph.page, 'B\'s page (English)', 'en');
    const en = await readable(ph.page);
    assert.ok(en.includes(`Results: ${B.display_name}`) && en.includes('Absent'), 'the English heading names B, and Absent');
    await shot(ph.page, EVIDENCE, '11d-2-guardian-results-en');
    await ph.ctx.close();
  });
});
