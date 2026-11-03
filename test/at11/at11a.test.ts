// AT-11a (contract product-contract-r2, R2-b learner view): learner A opens My
// results: exam, subject, date, "mark / maximum" (17 / 20) or "Absent". No
// average, rank, grade letter, other learner's mark or name, in the page,
// address or hidden field. Learner B sees only B's rows. Drafts never appear.
// Driven in Chromium at phone width, Arabic first, then English; screenshots
// go to evidence/at-11/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, follow, phone, readable, shot, signIn } from '../support/browser.ts';
import { A, B, C, D, as, resultsWorld } from '../at10/marks.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-11/', import.meta.url));
const NEVER = ['average', 'rank', 'grade', 'المتوسط', 'الترتيب', 'التقدير', 'معدل', 'Quiz 2', '9 / 10'];

let w: Awaited<ReturnType<typeof resultsWorld>>;
let browser: Browser;

/** The result cards of a My results page: [exam · subject, date, score]. */
function cards(html: string): string[][] {
  return [...html.matchAll(/<li class="card result" data-result="([^"]+)">([\s\S]*?)<\/li>/g)].map((m) => [
    (m[2].match(/<bdi class="exam">([^<]*)<\/bdi>/)?.[1] ?? '') + ' · ' + (m[2].match(/<bdi class="subject">([^<]*)<\/bdi>/)?.[1] ?? ''),
    m[2].match(/<span class="muted date" dir="ltr">([^<]*)<\/span>/)?.[1] ?? '',
    m[2].match(/<span class="score" dir="auto">([^<]*)<\/span>/)?.[1] ?? '',
  ]);
}

describe('AT-11a each learner sees exactly their own published results', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await resultsWorld();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('A: one row, "Mid-term · Mathematics", its date, "17 / 20"; nothing of anyone else, no draft', async () => {
    const a = await as(w, A);
    const res = await a.get(`/s/${w.spaceId}/results`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const html = await res.text();
    assert.deepEqual(cards(html), [['Mid-term · Mathematics', '2026-11-12', '17 / 20']]);
    for (const other of [B, C, D]) assert.ok(!html.includes(other.display_name) && !html.includes(other.username), `nothing of ${other.username}`);
    assert.ok(!html.includes(A.username), 'not even A\'s own username');
    for (const mark of ['12', '15.5']) assert.ok(!html.includes(`>${mark}`) && !html.includes(`${mark} /`), `no other learner's mark ${mark}`);
    for (const word of NEVER) assert.ok(!html.toLowerCase().includes(word.toLowerCase()), `no "${word}"`);
    assert.ok(!/<input[^>]*type="hidden"/.test(html), 'no hidden field');
    for (const id of [w.ids[B.username], w.ids[C.username], w.ids[D.username], w.published[B.username].id, w.published[C.username].id, w.published[D.username].id]) {
      assert.ok(!html.includes(id), `no address or id of anyone else (${id})`);
    }
    assert.ok(!html.includes(w.draft[A.username].id), 'not the id of A\'s draft');
  });

  it('B: only B\'s row, "Absent"', async () => {
    const html = await (await (await as(w, B)).get(`/s/${w.spaceId}/results`)).text();
    assert.deepEqual(cards(html), [['Mid-term · Mathematics', '2026-11-12', 'غائب']]);
    for (const other of [A, C, D]) assert.ok(!html.includes(other.display_name), `nothing of ${other.username}`);
    assert.ok(!html.includes('17 /'), 'not A\'s mark');
  });

  it('C and D, who share a name, each see their own mark only', async () => {
    assert.deepEqual(cards(await (await (await as(w, C)).get(`/s/${w.spaceId}/results`)).text()).map((c) => c[2]), ['12 / 20']);
    assert.deepEqual(cards(await (await (await as(w, D)).get(`/s/${w.spaceId}/results`)).text()).map((c) => c[2]), ['15.5 / 20']);
  });

  it('in a real browser at phone width: from the home to My results and one result, Arabic then English; the address holds only her own result', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, A.username, A.password);
    await follow(ph.page, '#my-results');
    await assertPage(ph.page, 'My results (Arabic)', 'ar');
    const ar = await readable(ph.page);
    assert.ok(ar.includes('نتائجي') && ar.includes('17 / 20') && ar.includes('Mathematics'), 'the title and the row');
    await shot(ph.page, EVIDENCE, '11a-1-my-results-ar');
    await follow(ph.page, '#results a');
    assert.ok(ph.page.url().endsWith(`/s/${w.spaceId}/results/${w.published[A.username].id}`), 'the address names her own result only');
    await assertPage(ph.page, 'one result (Arabic)', 'ar');
    await shot(ph.page, EVIDENCE, '11a-2-one-result-ar');
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}/results`);
    await assertPage(ph.page, 'My results (English)', 'en');
    const en = await readable(ph.page);
    assert.ok(en.includes('My results') && en.includes('Only your own results appear here.') && en.includes('17 / 20'));
    for (const word of NEVER) assert.ok(!en.toLowerCase().includes(word.toLowerCase()), `no "${word}"`);
    await shot(ph.page, EVIDENCE, '11a-3-my-results-en');
    await ph.ctx.close();

    const b = await phone(browser, 'en-US');
    await signIn(w.p.url, b.page, B.username, B.password);
    await b.page.goto(w.p.url + `/s/${w.spaceId}/results`);
    assert.ok((await readable(b.page)).includes('غائب'), 'B reads Absent');
    await shot(b.page, EVIDENCE, '11a-4-absent-ar');
    await b.ctx.close();
  });
});
