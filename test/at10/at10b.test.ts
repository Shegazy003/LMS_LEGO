// AT-10b (contract product-contract-r2, R2-b): the marks page lists every
// learner assigned to the subject (by group or directly), sorted by name, then
// username, the same order on every visit. Each row shows the name plus a
// second identifier (the username tail) and a mark box with a numeric keyboard
// and an Absent tick. A header shows "N learners". With C and D (same name)
// the rows are told apart by the identifier. A 40-learner list works at phone
// width. Screenshots go to evidence/at-10/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, phone, readable, shot, signIn } from '../support/browser.ts';
import { utcDatePlusDays } from '../support/http.ts';
import { seed } from '../support/seed.ts';
import { ADMIN, KARIM, G1 } from '../at9/world.ts';
import { A, B, C, D, HADEER, MATH_ORDER, as, createExam, marksPath, marksWorld, shownRows, type World } from './marks.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-10/', import.meta.url));

let w: World & { science: string };
let browser: Browser;
let exam = '';
let big = '';
const FORTY = Array.from({ length: 40 }, (_, i) => {
  // Names out of order on purpose, some shared, Arabic and Latin, so the sort is really tested.
  const names = ['Ziad Test', 'Amira Test', 'Omar Test', 'نور تجربة', 'Bassem Test'];
  const n = String(40 - i).padStart(2, '0');
  return { display_name: names[i % names.length], username: `pupil.${n}`, password: `pupil-${n}-pass`, role: 'learner' as const, mobile: `0109000${n.padStart(4, '0')}`, valid_until: utcDatePlusDays(30) };
});

describe('AT-10b the marks page lists every learner of the subject in a fixed order, each told apart', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await marksWorld();
    browser = await chromium.launch();
    const hadeer = await as(w, HADEER);
    exam = await createExam(w, hadeer, w.content.math, { title: 'Mid-term' });
    const s = await seed(w.p.url, {
      spaceId: w.spaceId,
      grantedBy: ADMIN.username,
      people: FORTY,
      groups: [{ name: 'Grade 5', members: FORTY.map((p) => p.username) }],
      subjects: [{ title: 'Big class', publisher: HADEER.username, published: true, groups: ['Grade 5'] }],
    });
    Object.assign(w.ids, s.users);
    big = await createExam(w, hadeer, s.subjects['Big class'].id, { title: 'Weekly quiz', max_mark: '10' });
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('every learner of Mathematics (group Science and D directly), by name then username; nobody else', async () => {
    const hadeer = await as(w, HADEER);
    const res = await hadeer.get(marksPath(w, exam));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const html = await res.text();
    const rows = shownRows(html);
    assert.deepEqual(rows.map((r) => r.learner), MATH_ORDER.map((p) => w.ids[p.username]), 'C, D (both "Omar Test", by username), then A, then B');
    assert.deepEqual(rows.map((r) => r.name), MATH_ORDER.map((p) => p.display_name));
    assert.match(html, /id="roster-count" data-count="4"/, 'the header counts 4');
    for (const nobody of [KARIM.display_name, G1.display_name, HADEER.display_name]) assert.ok(!rows.some((r) => r.name === nobody), `not ${nobody}`);
  });

  it('each row: the name, a second identifier from the username, a numeric mark box and an Absent tick; C and D are told apart', async () => {
    const hadeer = await as(w, HADEER);
    const html = await (await hadeer.get(marksPath(w, exam))).text();
    const rows = shownRows(html);
    for (const [r, p] of rows.map((r, i) => [r, MATH_ORDER[i]] as const)) {
      const tail = r.secondId.split('…')[1] ?? '';
      assert.ok(tail.length >= 3 && p.username.endsWith(tail), `${p.username}: the identifier is the end of the username (${r.secondId})`);
      assert.equal(r.inputmode, 'decimal', `${p.username}: the box opens a numeric keyboard`);
      assert.match(html, new RegExp(`type="checkbox" name="absent:${w.ids[p.username]}" value="1"`), `${p.username}: an Absent tick`);
    }
    const [c, d] = rows;
    assert.equal(c.name, d.name, 'C and D share the name');
    assert.notEqual(c.secondId, d.secondId, `and differ by the identifier (${c.secondId} / ${d.secondId})`);
    assert.ok(!html.includes(`>${C.username}<`) && !html.includes(`>${D.username}<`), 'the full username is not shown');
  });

  it('the same order on every visit, and after the list changes only the change moves', async () => {
    const hadeer = await as(w, HADEER);
    const first = shownRows(await (await hadeer.get(marksPath(w, exam))).text()).map((r) => r.learner);
    for (let i = 0; i < 3; i++) {
      const again = await as(w, HADEER);
      assert.deepEqual(shownRows(await (await again.get(marksPath(w, exam))).text()).map((r) => r.learner), first, `visit ${i + 2}`);
    }
    assert.deepEqual(first, [C, D, A, B].map((p) => w.ids[p.username]));
  });

  it('a 40-learner list at phone width: every row, in order, nothing wider than the screen (Arabic and English)', async () => {
    const hadeer = await as(w, HADEER);
    const rows = shownRows(await (await hadeer.get(marksPath(w, big))).text());
    assert.equal(rows.length, 40);
    const expected = [...FORTY].sort((x, y) => (x.display_name < y.display_name ? -1 : x.display_name > y.display_name ? 1 : x.username < y.username ? -1 : 1));
    assert.deepEqual(rows.map((r) => r.learner), expected.map((p) => w.ids[p.username]), 'by name, then username');
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, HADEER.username, HADEER.password);
    await ph.page.goto(w.p.url + marksPath(w, big));
    await assertPage(ph.page, '40 rows (Arabic)', 'ar');
    assert.equal(await ph.page.locator('#rows > li').count(), 40);
    assert.ok((await readable(ph.page)).includes('40'), 'the header says 40');
    // Every box and tick can be reached and used at this width.
    await ph.page.locator('#rows > li').last().locator('input.mark').fill('7');
    await ph.page.locator('#rows > li').first().locator('input[type=checkbox]').check();
    await assertPage(ph.page, '40 rows, after typing (Arabic)', 'ar');
    await shot(ph.page, EVIDENCE, '10b-1-forty-rows-ar');
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + marksPath(w, exam));
    await assertPage(ph.page, 'Mathematics (English)', 'en');
    const en = await readable(ph.page);
    assert.ok(en.includes('On this list (Student): 4'), 'the header in English, with the kit word');
    assert.ok(en.includes('Absent') && en.includes('username …'), 'the tick and the identifier in English');
    await shot(ph.page, EVIDENCE, '10b-2-marks-page-en');
    await ph.ctx.close();
  });
});
