// AT-10a (contract product-contract-r2, R2-b): the publisher creates an exam
// inside their subject: title, date, maximum mark (for example 20). Another
// publisher, an admin and a learner cannot create an exam, save drafts or
// publish for that subject, by screen or forged request.
//
// Hadeer makes the exam in Chromium at phone width, from her subject's page,
// Arabic first, then English; screenshots go to evidence/at-10/. The refusals
// are checked by address (the screens) and by forged posts, each with the
// database read after it.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, follow, phone, readable, shot, signIn, submit } from '../support/browser.ts';
import { A, HADEER, MATH_ORDER, SHIMAA, as, count, createExam, examListPath, marksForm, marksPath, marksWorld, type World } from './marks.ts';
import { ADMIN } from '../at9/world.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-10/', import.meta.url));

let w: World & { science: string };
let browser: Browser;

describe('AT-10a the publisher creates an exam in their subject; nobody else can create, save or publish for it', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await marksWorld();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('Hadeer makes "Mid-term", dated, out of 20, from her subject page, in a real browser at phone width (Arabic, then English)', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, HADEER.username, HADEER.password);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}/publish/edit/${w.content.math}`);
    await follow(ph.page, '#exam-list-link');
    await assertPage(ph.page, 'the exam list (Arabic)', 'ar');
    assert.ok((await readable(ph.page)).includes('امتحان'), 'the School kit word for an exam (امتحان)');
    await ph.page.fill('form#new-exam input[name=title]', 'Mid-term');
    await ph.page.fill('form#new-exam input[name=exam_date]', '2026-11-12');
    await ph.page.fill('form#new-exam input[name=max_mark]', '20');
    await shot(ph.page, EVIDENCE, '10a-1-new-exam-ar');
    assert.equal(await submit(ph.page, 'form#new-exam'), 303, 'the exam is made');
    assert.match(ph.page.url(), new RegExp(`/s/${w.spaceId}/publish/marks/[0-9a-f-]{36}$`), 'and its marks page opens');
    await assertPage(ph.page, 'the marks page (Arabic)', 'ar');
    await shot(ph.page, EVIDENCE, '10a-2-marks-page-ar');

    const rows = await w.p.sql(`SELECT e.space_id, e.subject_id, e.title, e.exam_date, e.max_mark, u.username FROM exam e JOIN user u ON u.id = e.created_by`);
    assert.deepEqual(rows.map((r) => ({ ...r, max_mark: Number(r.max_mark) })), [{
      space_id: w.spaceId, subject_id: w.content.math, title: 'Mid-term', exam_date: '2026-11-12', max_mark: 20, username: HADEER.username,
    }]);

    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + examListPath(w, w.content.math));
    await assertPage(ph.page, 'the exam list (English)', 'en');
    const en = await readable(ph.page);
    assert.ok(en.includes('Exam list') && en.includes('Mid-term'), 'the exam is listed, with the kit word Exam');
    assert.ok(en.includes('2026-11-12') && en.includes('maximum 20'), 'with its date and maximum');
    await shot(ph.page, EVIDENCE, '10a-3-exam-list-en');
    await ph.ctx.close();
  });

  it('a refused form stores nothing: no title, no date, a maximum of 0, letters or two decimals', async () => {
    const hadeer = await as(w, HADEER);
    const before = await count(w, 'SELECT COUNT(*) AS n FROM exam');
    for (const bad of [
      { title: '', exam_date: '2026-11-12', max_mark: '20' },
      { title: 'Quiz', exam_date: '', max_mark: '20' },
      { title: 'Quiz', exam_date: '2026-13-40', max_mark: '20' },
      { title: 'Quiz', exam_date: '2026-11-12', max_mark: '0' },
      { title: 'Quiz', exam_date: '2026-11-12', max_mark: 'twenty' },
      { title: 'Quiz', exam_date: '2026-11-12', max_mark: '20.25' },
    ]) {
      const res = await hadeer.post(examListPath(w, w.content.math), bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.match(await res.text(), /id="error"/, `${JSON.stringify(bad)}: the page says why`);
    }
    assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam'), before);
  });

  it('another publisher, an admin and a learner cannot create, save a draft or publish for Mathematics, by screen or forged request', async () => {
    const hadeer = await as(w, HADEER);
    const exam = await createExam(w, hadeer, w.content.math, { title: 'Quiz 1' });
    const everyone = MATH_ORDER.map((p) => p.username);
    const values = Object.fromEntries(everyone.map((u) => [u, { mark: '10' }]));
    const snapshot = async () => ({
      exams: await count(w, 'SELECT COUNT(*) AS n FROM exam'),
      results: await count(w, 'SELECT COUNT(*) AS n FROM exam_result'),
      published: await count(w, 'SELECT COUNT(*) AS n FROM exam_result WHERE published_at IS NOT NULL'),
      history: await count(w, 'SELECT COUNT(*) AS n FROM exam_result_history'),
    });
    const before = await snapshot();
    // A confirmation of Hadeer's own, so the forged second step carries a real fingerprint.
    const own = await hadeer.post(marksPath(w, exam), marksForm(w, everyone, values, 'publish'));
    assert.equal(own.status, 200, 'positive control: Hadeer reaches the confirmation');
    const version = (await own.text()).match(/name="version" value="([^"]+)"/)?.[1] ?? '';
    assert.ok(version);
    // Pressing Publish saved Hadeer's draft: that is the baseline from here on.
    const baseline = await snapshot();
    assert.equal(baseline.published, before.published, 'step one published nothing');

    for (const [who, person] of [['Shimaa (the publisher of another subject)', SHIMAA], ['the admin', ADMIN], ['learner A', A]] as const) {
      const c = await as(w, person);
      for (const path of [examListPath(w, w.content.math), marksPath(w, exam)]) {
        const res = await c.get(path);
        assert.equal(res.status, 403, `${who}: GET ${path} refused`);
        const body = await res.text();
        assert.ok(!body.includes('Quiz 1') && !body.includes('name="mark:'), `${who}: no exam and no mark box on ${path}`);
      }
      const forged = [
        ['create an exam', examListPath(w, w.content.math), { title: 'Forged', exam_date: '2026-11-12', max_mark: '20' }],
        ['save a draft', marksPath(w, exam), marksForm(w, everyone, { ...values, [A.username]: { mark: '20' } }, 'draft')],
        ['press Publish', marksPath(w, exam), marksForm(w, everyone, values, 'publish')],
        ['confirm Publish', `${marksPath(w, exam)}/publish`, (() => {
          const f = new FormData();
          for (const u of everyone) f.append('learner', w.ids[u]);
          f.set('version', version);
          return f;
        })()],
      ] as const;
      for (const [what, path, body] of forged) {
        const res = await c.post(path, body as Record<string, string> | FormData);
        assert.equal(res.status, 403, `${who}: ${what} refused`);
      }
      assert.deepEqual(await snapshot(), baseline, `${who}: nothing stored, nothing changed, nothing published`);
    }
    assert.equal((await w.p.sql(`SELECT title FROM exam WHERE title = 'Forged'`)).length, 0);
    const marks = await w.p.sql(`SELECT mark FROM exam_result WHERE exam_id = '${exam}' AND learner_user_id = '${w.ids[A.username]}'`);
    assert.deepEqual(marks.map((r) => Number(r.mark)), [10], 'A\'s draft is still Hadeer\'s 10');
  });

  it('Shimaa\'s screens do not offer Mathematics at all', async () => {
    const shimaa = await as(w, SHIMAA);
    const home = await (await shimaa.get(`/s/${w.spaceId}/publish`)).text();
    assert.ok(!home.includes(w.content.math), 'Mathematics is not on her home');
    assert.equal((await shimaa.get(`/s/${w.spaceId}/publish/edit/${w.content.math}`)).status, 403, 'nor its subject page');
  });
});
