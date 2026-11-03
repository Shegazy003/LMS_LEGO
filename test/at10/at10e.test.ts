// AT-10e (contract product-contract-r2, R2-b): Publish opens a confirmation
// page that lists every row: name, second identifier, mark or Absent, maximum,
// group. Cancel changes nothing. If learners joined or left the subject since
// the draft, the page says "N learners changed since your draft": rows of
// learners who left are not published; new learners appear as empty rows that
// must be completed.
//
// "Since the draft" here is since the marks page the publisher filled in was
// opened: that page carries the list it showed (README, R2-b assumptions).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, follow, phone, readable, shot, signIn, submit } from '../support/browser.ts';
import { utcDatePlusDays } from '../support/http.ts';
import {
  A, B, C, D, HADEER, MATH_ORDER, as, confirmFields, confirmForm, count, createExam, marksForm, marksPath, marksWorld, pressPublish, publishAll,
  setScience, shownRows, storedRows, type World,
} from './marks.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-10/', import.meta.url));
const E = { display_name: 'Nour Test', username: 'nour.e', password: 'nour-first-pass', role: 'learner', mobile: '01035353535' };

let w: World & { science: string };
let browser: Browser;
const everyone = MATH_ORDER.map((p) => p.username);
const values = { [C.username]: { mark: '12' }, [D.username]: { mark: '15,5' }, [A.username]: { mark: '17' }, [B.username]: { absent: true } };

describe('AT-10e Publish shows every row first; Cancel changes nothing; a changed list is named and must be completed', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await marksWorld();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('the confirmation lists every row: name, second identifier, mark or Absent, the maximum, the group (Science, or assigned directly)', async () => {
    const hadeer = await as(w, HADEER);
    const exam = await createExam(w, hadeer, w.content.math, { title: 'Mid-term', max_mark: '20' });
    const step = await pressPublish(w, hadeer, exam, everyone, values);
    assert.equal(step.status, 200);
    const rows = shownRows(step.html);
    assert.deepEqual(rows.map((r) => r.learner), MATH_ORDER.map((p) => w.ids[p.username]), 'every row, in the page order');
    assert.deepEqual(rows.map((r) => r.name), MATH_ORDER.map((p) => p.display_name));
    assert.ok(rows.every((r) => /…\S{3,}/.test(r.secondId)), 'each with its second identifier');
    assert.notEqual(rows[0].secondId, rows[1].secondId, 'C and D told apart');
    assert.deepEqual(rows.map((r) => r.value), ['12', '15.5', '17', 'غائب'], 'mark or Absent');
    assert.ok([...step.html.matchAll(/<span class="muted max" dir="ltr">\/ 20<\/span>/g)].length === 4, 'the maximum on every row');
    assert.deepEqual(rows.map((r) => r.group), ['فصل: Science', 'فصل: مخصّص مباشرة', 'فصل: Science', 'فصل: Science'], 'the group, or "assigned directly" for D');
    assert.ok(!step.html.includes('id="changed"'), 'nothing changed');
    assert.ok(confirmFields(step.html), 'and the confirming button');
    assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result WHERE published_at IS NOT NULL'), 0, 'nothing is published yet');
  });

  it('in a real browser at phone width: Publish, check every row, Cancel: nothing is published, the draft is as it was', async () => {
    const hadeer = await as(w, HADEER);
    const exam = await createExam(w, hadeer, w.content.math, { title: 'Quiz 1', max_mark: '10' });
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, HADEER.username, HADEER.password);
    await ph.page.goto(w.p.url + marksPath(w, exam));
    const row = (u: string) => ph.page.locator(`#rows > li[data-learner="${w.ids[u]}"]`);
    for (const [u, mark] of [[C.username, '6'], [D.username, '7'], [A.username, '8,5']]) await row(u).locator('input.mark').fill(mark);
    await row(B.username).locator('input[type=checkbox]').check();
    assert.equal(await submit(ph.page, 'form#marks', 'button[value=publish]'), 200, 'Publish opens the confirmation');
    await assertPage(ph.page, 'the confirmation (Arabic)', 'ar');
    assert.equal(await ph.page.locator('#confirm-rows > li').count(), 4, 'every row');
    await shot(ph.page, EVIDENCE, '10e-1-confirmation-ar');
    const draft = await storedRows(w, exam);
    await follow(ph.page, '#cancel');
    assert.ok(ph.page.url().endsWith(marksPath(w, exam)), 'Cancel goes back to the marks page');
    assert.deepEqual(await storedRows(w, exam), draft, 'Cancel changed nothing');
    assert.ok(Object.values(draft).every((r) => r.published_at === null), 'nothing is published');
    assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result_history'), 0, 'no history');
    assert.deepEqual(await ph.page.locator('#rows input.mark').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)), ['6', '7', '8.5', '']);
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + marksPath(w, exam));
    assert.equal(await submit(ph.page, 'form#marks', 'button[value=publish]'), 200);
    await assertPage(ph.page, 'the confirmation (English)', 'en');
    const en = await readable(ph.page);
    assert.ok(en.includes('Publish these marks?') && en.includes('Absent') && en.includes('Class: Science') && en.includes('assigned directly'), 'in English, with the kit word for the group');
    await shot(ph.page, EVIDENCE, '10e-2-confirmation-en');
    await ph.ctx.close();
  });

  it('C leaves and E joins while the page is open: "2 changed since your draft", C is not published, E is an empty row to complete', async () => {
    const hadeer = await as(w, HADEER);
    const exam = await createExam(w, hadeer, w.content.math, { title: 'Final', max_mark: '20' });
    // The page Hadeer fills in shows C, D, A and B.
    const opened = shownRows(await (await hadeer.get(marksPath(w, exam))).text()).map((r) => r.learner);
    assert.deepEqual(opened, MATH_ORDER.map((p) => w.ids[p.username]));
    assert.equal((await hadeer.post(marksPath(w, exam), marksForm(w, everyone, values, 'draft'))).status, 303, 'the draft, with C in it');
    // Meanwhile the admin appoints E and puts her in Science, and takes C out of Science.
    const appointed = await w.admin.post(`/s/${w.spaceId}/admin/people`, { ...E, valid_until: utcDatePlusDays(30) });
    assert.equal(appointed.status, 303, 'E appointed');
    w.ids[E.username] = String((await w.p.sql(`SELECT id FROM user WHERE username = '${E.username}'`))[0].id);
    await setScience(w, [A.username, B.username, E.username]);

    const step = await pressPublish(w, hadeer, exam, everyone, values);
    assert.equal(step.status, 200);
    assert.match(step.html, /id="changed"/);
    const notice = (step.html.match(/<div id="changed"[\s\S]*?<\/div>/)?.[0] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // Hadeer reads English since the browser step above.
    assert.ok(notice.startsWith('2 changed since your draft (Student).'), `the page says 2 changed since the draft: ${notice}`);
    const rows = shownRows(step.html);
    assert.deepEqual(rows.map((r) => r.learner), [E, D, A, B].map((p) => w.ids[p.username]), 'C is not listed; E is');
    const e = rows.find((r) => r.learner === w.ids[E.username])!;
    assert.ok(e.empty && e.error, 'E is an empty row that must be completed');
    assert.equal(confirmFields(step.html), null, 'no confirming button while a row is empty');
    assert.match(step.html, /id="complete-first"/);
    // A forged confirm anyway publishes nothing.
    const forged = await hadeer.post(`${marksPath(w, exam)}/publish`, confirmForm({ learners: [E, D, A, B].map((p) => w.ids[p.username]), version: 'x' }));
    assert.equal(forged.status, 409);
    assert.equal(await count(w, `SELECT COUNT(*) AS n FROM exam_result WHERE exam_id = '${exam}' AND published_at IS NOT NULL`), 0, 'nothing published');

    // Back on the marks page: C is gone, E is there, empty; completed, the list publishes.
    const page = shownRows(await (await hadeer.get(marksPath(w, exam))).text());
    assert.deepEqual(page.map((r) => r.learner), [E, D, A, B].map((p) => w.ids[p.username]));
    assert.equal(page.find((r) => r.learner === w.ids[E.username])!.typed, '');
    await publishAll(w, hadeer, exam, [E, D, A, B].map((p) => p.username), { ...values, [E.username]: { mark: '19' } });
    const stored = await storedRows(w, exam);
    assert.ok([E, D, A, B].every((p) => stored[p.username].published_at !== null), 'D, E, A and B are published');
    assert.equal(stored[C.username].published_at, null, 'C\'s row (she left) is not published');
    assert.equal(stored[E.username].mark, 19);
  });
});
