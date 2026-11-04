// AT-12a (contract product-contract-r2, R2-c): the publisher changes a
// published mark 14 to 16 with a required reason, and another row to Absent.
// Learner and guardian see the new value on the next request with "Corrected
// on <date>"; the previous value is not shown to them.
//
// "Quiz 1" (maximum 20) is published with A 14, B 11, C 12, D 15. Hadeer
// corrects A to 16 in a real browser at phone width (Arabic), and B to Absent
// through the same form posted directly. The date shown is the day of the
// correction (YYYY-MM-DD, the date form every page of the product uses).
// Screenshots go to evidence/at-12/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, follow, phone, readable, shot, signIn, submit } from '../support/browser.ts';
import {
  A, B, C, G1, G2, HADEER, as, corrected, correctionWorld, guardianResults, isoDay, linkedPath, marksPath, quiz1, resultCards, standsAlone, stored, text,
  type CorrectionWorld,
} from './corrections.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-12/', import.meta.url));

let w: CorrectionWorld;
let browser: Browser;
let exam = '';
let rows: Awaited<ReturnType<typeof quiz1>>['rows'];

/** The visible text of a page without its tags. */
const visibleText = (html: string) => text(html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' '));

describe('AT-12a a published mark is corrected with a reason; the learner and the guardian see the new value with "Corrected on <date>", never the old one', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await correctionWorld();
    ({ exam, rows } = await quiz1(w));
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('before: A and G1 read Quiz 1 as 14 / 20, with no "Corrected" line', async () => {
    const a = await (await (await as(w, A)).get(`/s/${w.spaceId}/results`)).text();
    const quiz = resultCards(a).find((c) => c.exam === 'Quiz 1');
    assert.deepEqual([quiz?.score, quiz?.corrected], ['14 / 20', '']);
  });

  it('Hadeer opens the correction page from the marks page in a real browser (Arabic) and corrects A from 14 to 16 with a reason', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, HADEER.username, HADEER.password);
    await ph.page.goto(w.p.url + marksPath(w, exam));
    await follow(ph.page, `li.mark-row[data-learner="${w.ids[A.username]}"] a.correct`);
    await assertPage(ph.page, 'the correction page (Arabic)', 'ar');
    const page = await readable(ph.page);
    assert.ok(page.includes(A.display_name) && standsAlone(page, '14'), 'the row and its current value');
    // The reason is required on the page itself too.
    assert.equal(await ph.page.getAttribute('form#correct textarea[name=reason]', 'required'), '');
    await ph.page.fill('form#correct input[name=mark]', '16');
    await ph.page.fill('form#correct textarea[name=reason]', 'Question 3 was marked twice');
    await shot(ph.page, EVIDENCE, '12a-1-correction-form-ar');
    const status = await submit(ph.page, 'form#correct');
    assert.equal(status, 303, 'accepted');
    await shot(ph.page, EVIDENCE, '12a-2-after-correction-ar');
    await ph.ctx.close();
    const { row, history } = await stored(w, rows[A.username].id);
    assert.deepEqual([row.status, Number(row.mark)], ['marked', 16], 'the new value is stored');
    assert.equal(history.length, 2);
    assert.deepEqual([history[1].previous_status, Number(history[1].previous_mark), history[1].new_status, Number(history[1].new_mark), history[1].reason],
      ['marked', 14, 'marked', 16, 'Question 3 was marked twice']);
  });

  it('Hadeer corrects B from 11 to Absent with a reason', async () => {
    await corrected(w, w.hadeer, exam, w.ids[B.username], { absent: true, reason: 'Was not in the room; the paper was someone else\'s' });
    const { row, history } = await stored(w, rows[B.username].id);
    assert.deepEqual([row.status, row.mark], ['absent', null]);
    assert.deepEqual([history[1].previous_status, Number(history[1].previous_mark), history[1].new_status, history[1].new_mark], ['marked', 11, 'absent', null]);
  });

  it('A sees 16 / 20 and "Corrected on <date>" on My results and on the result page; 14 is nowhere, nor the reason', async () => {
    const a = await as(w, A);
    const { history } = await stored(w, rows[A.username].id);
    const day = isoDay(Number(history[1].changed_at));
    for (const path of [`/s/${w.spaceId}/results`, `/s/${w.spaceId}/results/${rows[A.username].id}`]) {
      const res = await a.get(path);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const html = await res.text();
      const quiz = resultCards(html).find((c) => c.exam === 'Quiz 1');
      assert.equal(quiz?.score, '16 / 20', path);
      assert.equal(quiz?.corrected, `صُحّحت في ${day}`, `${path}: Corrected on the day of the correction`);
      assert.ok(!html.includes('14 / 20') && !standsAlone(visibleText(html), '14'), `${path}: the previous value is not shown`);
      assert.ok(!html.includes('Question 3'), `${path}: the reason is not shown to the learner`);
    }
    // Mid-term was never corrected: no line there.
    const mid = resultCards(await (await a.get(`/s/${w.spaceId}/results`)).text()).find((c) => c.exam === 'Mid-term');
    assert.equal(mid?.corrected, '', 'an uncorrected result carries no line');
  });

  it('B sees Absent with "Corrected on <date>"; 11 is nowhere', async () => {
    const html = await (await (await as(w, B)).get(`/s/${w.spaceId}/results`)).text();
    const quiz = resultCards(html).find((c) => c.exam === 'Quiz 1');
    assert.equal(quiz?.score, 'غائب');
    assert.ok(quiz?.corrected.startsWith('صُحّحت في '), 'the Corrected line');
    assert.ok(!html.includes('11 / 20') && !standsAlone(visibleText(html), '11'), 'the previous value is not shown');
  });

  it('G1 sees A 16 / 20 and B Absent, each with "Corrected on <date>"; G2 sees A only; the old values and the reasons nowhere', async () => {
    const g1 = await as(w, G1);
    const aHtml = await (await g1.get(linkedPath(w, A.username))).text();
    const bHtml = await (await g1.get(linkedPath(w, B.username))).text();
    const aQuiz = guardianResults(aHtml)?.cards.find((c) => c.exam === 'Quiz 1');
    const bQuiz = guardianResults(bHtml)?.cards.find((c) => c.exam === 'Quiz 1');
    assert.deepEqual([aQuiz?.score, aQuiz?.corrected.startsWith('صُحّحت في ')], ['16 / 20', true]);
    assert.deepEqual([bQuiz?.score, bQuiz?.corrected.startsWith('صُحّحت في ')], ['غائب', true]);
    for (const [html, old] of [[aHtml, '14'], [bHtml, '11']] as const) {
      assert.ok(!html.includes(`${old} / 20`) && !standsAlone(visibleText(html), old), `the previous value ${old} is not shown`);
      assert.ok(!html.includes('Question 3') && !html.includes('not in the room'), 'no reason');
    }
    const g2 = await as(w, G2);
    const g2a = guardianResults(await (await g2.get(linkedPath(w, A.username))).text());
    assert.equal(g2a?.cards.find((c) => c.exam === 'Quiz 1')?.score, '16 / 20');
    assert.equal((await g2.get(linkedPath(w, B.username))).status, 403, 'G2 still sees nothing of B');
  });

  it('C, who was not corrected, still reads 12 / 20 with no line; English says "Corrected on <date>"', async () => {
    const c = await as(w, C);
    const quiz = resultCards(await (await c.get(`/s/${w.spaceId}/results`)).text()).find((x) => x.exam === 'Quiz 1');
    assert.deepEqual([quiz?.score, quiz?.corrected], ['12 / 20', '']);
    const a = await as(w, A);
    assert.equal((await a.post('/account/language', { lang: 'en' })).status, 303);
    const en = resultCards(await (await a.get(`/s/${w.spaceId}/results`)).text()).find((x) => x.exam === 'Quiz 1');
    assert.ok(en?.corrected.startsWith('Corrected on 20'), `English: ${en?.corrected}`);
  });

  it('in a real browser at phone width: A reads the corrected result, English', async () => {
    const ph = await phone(browser, 'en-US');
    await signIn(w.p.url, ph.page, A.username, A.password);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}/results`);
    await assertPage(ph.page, 'My results (English)', 'en');
    const page = await readable(ph.page);
    assert.ok(page.includes('16 / 20') && page.includes('Corrected on'), 'the new value and the line');
    await shot(ph.page, EVIDENCE, '12a-3-learner-corrected-en');
    await ph.ctx.close();
  });
});
