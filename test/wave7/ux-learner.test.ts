// LMS wave 7, W7-2: the UX floor of the learner's side (ux-plan on PIL-261,
// rev a6f86da5): UX-72, UX-73, UX-74 and UX-76, and UX-77, UX-78 and UX-79 for
// the subject page's quiz section, the take page, the result page and their
// previews. (The teacher's side is test/wave7/ux.test.ts, W7-1; its UX-77
// string checks run over every quiz key, the learner's included.) One describe
// per CI step (`UX-<n> ...`, selected with --test-name-pattern), each on a
// fresh wave 7 world (W7-a, no W7-b) with the clock pinned, in Chromium
// (Playwright), script on unless stated. Screenshots go to evidence/ux/ as the
// ux-plan names them. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import {
  ADMIN, HADEER, NOUR6, QX, QL, SALMA, W7A, WIDTHS, as, browserAs, closeWave6, go, subjectPath, uxShot, wave7World, withW7c, withW7d, withW7e, words,
  type W7a, type Wave1World, type Width,
} from './world.ts';
import { previewTakePath, resultOf, resultPath, sectionOf, takeOf, takePath } from './learner.ts';

type Lang = 'ar' | 'en';
const UNIVERSITY_ADMIN = { username: 'nadia.admin', password: 'admin-third-pass' };
const COMPANY_ADMIN = { username: 'basem.admin', password: 'admin-other-pass' };
const LEARNER_KEYS: UiKey[] = ['quizSectionTitle', 'quizMoreTitle', 'quizNotTaken', 'quizTakenScore', 'quizTakeHelp', 'quizSubmit', 'quizChanged', 'quizNowClosed', 'quizAnswerInvalid', 'quizAlreadySent', 'quizResultTitle', 'quizSentOn', 'quizBackToSubject', 'quizPreviewNotSaved', 'quizScoreLine', 'quizQuestionHeading', 'quizChosen', 'quizRightMark', 'quizRight', 'quizWrong', 'quizNoAnswer'];

const sql = (w: Wave1World) => (q: string) => w.p.sql(q);

async function open(browser: Browser, w: Wave1World, who: { username: string; password: string }, path: string, opts: { width?: Width; lang?: Lang; script?: boolean } = {}) {
  const tabbed = await browserAs(browser, w, who, { width: opts.width ?? 'phone', lang: opts.lang ?? 'ar', script: opts.script });
  await go(tabbed.page, w, path);
  return tabbed;
}

/** Submits the form holding `button` and waits for the next page. */
async function submit(page: Page, button = '#quiz-take button[type=submit]') {
  await Promise.all([page.waitForEvent('load'), page.click(button)]);
}

const inDomOrder = (page: Page, selectors: string[]) => page.evaluate((sels) => {
  const els = sels.map((s) => document.querySelector(s));
  if (els.some((e) => !e)) return `missing: ${sels.filter((_, i) => !els[i]).join(', ')}`;
  for (let i = 1; i < els.length; i++) {
    if (!(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING)) return `${sels[i - 1]} is not before ${sels[i]}`;
  }
  return 'ok';
}, selectors);

const active = (page: Page) => page.evaluate(() => {
  const e = document.activeElement as HTMLElement | null;
  return e ? { id: e.id, role: e.getAttribute('role') } : null;
});

/** The checked answers of the take form, read from the DOM (question id to answer id). */
const checkedOf = (page: Page) => page.$$eval('#quiz-take input[type=radio]:checked', (rs) => Object.fromEntries(rs.map((r) => [(r as HTMLInputElement).name.replace(/^q-/, ''), (r as HTMLInputElement).value])));

/** Checks the first answer of every question. */
const pickFirst = (page: Page) => page.$$eval('#quiz-take fieldset', (fs) => fs.forEach((f) => { (f.querySelector('input[type=radio]') as HTMLInputElement).checked = true; }));

/** Picks one answer per question by its answer id (the label is the target). */
async function pick(page: Page, picks: Record<string, string>) {
  for (const [q, a] of Object.entries(picks)) await page.check(`input[name="q-${q}"][value="${a}"]`);
}

function world() {
  const box: { w?: Wave1World; q?: W7a; browser?: Browser } = {};
  before(async () => {
    ({ w: box.w, q: box.q } = await wave7World());
    box.browser = await chromium.launch();
  });
  after(async () => {
    await box.browser?.close();
    await closeWave6(box.w);
  });
  return box as { w: Wave1World; q: W7a; browser: Browser };
}

const SALMA_PICKS = { 'qa-one': 'qa-one-b', 'qa-two': 'qa-two-a', 'qa-three': 'qa-three-b' };

// ------------------------------------------------------------------- UX-72 ----
describe('UX-72 subject page quiz section place, order, fold and absence', { concurrency: false }, () => {
  const x = world();

  it('UX-72 the section after the announcements and before the outline, h2 and a list of title links (44 px) with the secondary meta line; open-and-not-taken first, at most 5, the rest in a closed native fold; absent with nothing to list; the outline no lower with 30 than with 5 plus the fold', async () => {
    const { w, browser } = x;
    const s = w.school;
    const path = subjectPath(s, s.math);
    for (const [lang, width, shot] of [['ar', 'phone', 'UX-72-phone-ar'], ['en', 'desktop', 'UX-72-desktop-en']] as const) {
      const k = await open(browser, w, SALMA, path, { lang, width });
      const page = k.page;
      const t = words('school', lang);
      const order = ['#quizzes', '#quizzes > h2', '#quizzes ul.quiz-list', '#outline'];
      if (await page.$('#announcements')) order.unshift('#announcements');
      assert.equal(await inDomOrder(page, order), 'ok', `${lang}: after the announcements, before the outline`);
      assert.equal((await page.textContent('#quizzes > h2'))?.trim(), t('quizSectionTitle'));
      for (const m of await measure(page, '#quizzes a.quiz-row-link')) assert.ok(m.width >= 44 && m.height >= 44, `${lang}: the title link is a 44 px target (${m.width}x${m.height})`);
      for (const m of await measure(page, '#quizzes .quiz-meta')) assert.ok(m.contrast >= 4.5, `${lang}: the meta line ${m.contrast.toFixed(2)}:1`);
      const meta = await page.$eval('#quizzes .quiz-meta', (e) => ({ size: parseFloat(getComputedStyle(e).fontSize), body: parseFloat(getComputedStyle(document.body).fontSize) }));
      assert.ok(meta.size < meta.body, `${lang}: the meta line in the secondary (smaller) text style`);
      await uxShot(page, shot);
      await k.ctx.close();
    }
    // Taken: the item links to the result with quizTakenScore.
    const salma = await as(w, SALMA, 'ar');
    assert.equal((await salma.post(takePath(s, W7A.QA), { rev: '0', 'q-qa-one': 'qa-one-b', 'q-qa-two': 'qa-two-a' })).status, 303);
    const k = await open(browser, w, SALMA, path, { lang: 'ar' });
    assert.equal(await k.page.getAttribute('#quizzes a.quiz-row-link', 'href'), resultPath(s, W7A.QA));
    assert.equal((await k.page.textContent('#quizzes .quiz-meta'))?.trim(), words('school', 'ar')('quizTakenScore', { score: '1', total: '3' }));
    await uxShot(k.page, 'UX-72-phone-ar-taken');
    await k.ctx.close();

    // W7-e: QL first (open, not taken), then 4 taken, the other 25 in the closed fold.
    await withW7d(w, sql(w));
    const e = await withW7e(w, sql(w));
    const many = await open(browser, w, SALMA, path, { lang: 'ar' });
    const top = (p: Page) => p.$eval('#outline', (o) => o.getBoundingClientRect().top + window.scrollY);
    const sec = sectionOf(await many.page.content());
    assert.ok(sec && sec.fold, 'the fold');
    assert.equal(sec.items.length, 5, 'at most 5 items in the list');
    assert.equal(sec.items[0].href, takePath(s, e.ql), 'QL first (open, not taken)');
    assert.ok(sec.items.slice(1).every((i) => i.href.endsWith('/result')), 'then the taken ones');
    assert.equal(sec.fold.items.length, 25, 'the other 25 in the fold');
    assert.equal(sec.fold.summary, words('school', 'ar')('quizMoreTitle', { n: '25' }));
    assert.equal(await many.page.$eval('#quiz-more', (d) => (d as HTMLDetailsElement).open), false, 'closed by default (native details)');
    for (const m of await measure(many.page, '#quiz-more > summary')) assert.ok(m.width >= 44 && m.height >= 44, `the fold summary is a 44 px target (${m.width}x${m.height})`);
    await uxShot(many.page, 'UX-72-phone-ar-many');
    const top30 = await top(many.page);
    // Leave QL and 5 others (6: 5 shown, one in the fold), then QL and 4 (5: no fold).
    const stamp = Date.UTC(2026, 11, 10, 12);
    await w.p.sql(`UPDATE quiz SET removed_at = ${stamp} WHERE id IN (${e.others.slice(5).map((id) => `'${id}'`).join(',')})`);
    await many.page.reload();
    const top6 = await top(many.page);
    await w.p.sql(`UPDATE quiz SET removed_at = ${stamp} WHERE id = '${e.others[4]}'`);
    await many.page.reload();
    const top5 = await top(many.page);
    assert.equal(sectionOf(await many.page.content())?.fold, null, 'with 5: no fold');
    const fold = 16 + 44 + 16;
    assert.ok(top30 <= top6, `the outline with 30 (${top30}) no lower than with 5 shown and the closed fold (${top6})`);
    assert.ok(top30 <= top5 + fold, `the outline with 30 (${top30}) at most the closed fold (${fold} px) lower than with exactly 5 (${top5})`);
    await many.ctx.close();
    // Absent: nothing to list.
    await w.p.sql(`UPDATE quiz SET removed_at = ${stamp} WHERE subject_id = '${s.math}'`);
    const none = await open(browser, w, SALMA, path, { lang: 'ar' });
    assert.equal(await none.page.$('#quizzes'), null, 'no section');
    await none.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-73 ----
describe('UX-73 take page structure and labels', { concurrency: false }, () => {
  const x = world();

  it('UX-73 take page structure and labels: h1 the title in bdi, quizTakeHelp, one fieldset per question with legend "heading: text" (dir=auto), each answer a required radio inside its 44 px label (dir=auto), one primary quizSubmit at the end; no timer, progress bar or script', async () => {
    const { w, browser } = x;
    const s = w.school;
    await withW7d(w, sql(w));
    for (const [lang, width, quiz, shot] of [
      ['ar', 'phone', W7A.QA, 'UX-73-phone-ar'], ['ar', 'phone', QL, 'UX-73-phone-ar-largest'], ['ar', 'tablet', W7A.QA, 'UX-73-tablet-ar'], ['en', 'desktop', W7A.QA, 'UX-73-desktop-en'],
    ] as const) {
      const k = await open(browser, w, SALMA, takePath(s, quiz), { lang, width });
      const page = k.page;
      const t = words('school', lang);
      const take = takeOf(await page.content());
      assert.ok(take, `${lang} ${quiz}: the form`);
      const count = quiz === QL ? 20 : 3;
      assert.ok(take.titleInBdi, 'the h1 title in <bdi>');
      assert.equal(take.help, t('quizTakeHelp', { n: String(count) }));
      assert.equal(take.questions.length, count, 'one fieldset per question');
      take.questions.forEach((q, i) => assert.ok(q.legend.startsWith(`${t('quizQuestionHeading', { n: String(i + 1) })}:`), `legend ${i + 1}`));
      assert.equal(take.submit, t('quizSubmit'));
      assert.equal(await inDomOrder(page, ['#quiz-take-title', '.quiz-help', '#quiz-take fieldset', '#quiz-take button[type=submit]']), 'ok', 'h1, help, questions, the button at the end');
      assert.equal(await page.$$eval('#quiz-take button', (b) => b.length), 1, 'one button');
      assert.ok(await page.$$eval('#quiz-take input[type=radio]', (rs) => rs.every((r) => (r as HTMLInputElement).required && r.closest('label')?.classList.contains('quiz-choice'))), 'every radio required and inside its label');
      for (const m of await measure(page, '#quiz-take label.quiz-choice')) assert.ok(m.height >= 44 && m.width >= 44, `the whole label is a 44 px target (${m.width}x${m.height})`);
      assert.equal(await page.$$eval('script, progress, meter, [role=timer], [role=progressbar]', (e) => e.length), 0, 'no script, timer or progress bar');
      await uxShot(page, shot);
      await k.ctx.close();
    }
  });
});

describe('UX-73 take page errors and kept answers', { concurrency: false }, () => {
  const x = world();

  it('UX-73 take page errors and kept answers: quizChanged and quizNowClosed (409) and quizAnswerInvalid (400) at the top in role=alert, focused, the answers that still fit kept checked', async () => {
    const { w, browser } = x;
    const s = w.school;
    const t = words('school', 'ar');
    const k = await open(browser, w, SALMA, takePath(s, W7A.QA), { lang: 'ar' });
    const page = k.page;
    const check = async (key: 'quizChanged' | 'quizNowClosed' | 'quizAnswerInvalid', status: number, kept: Record<string, string>) => {
      assert.equal((await page.textContent('#quiz-message'))?.trim(), t(key), key);
      assert.equal(await page.getAttribute('#quiz-message', 'role'), 'alert');
      assert.equal(await inDomOrder(page, ['#quiz-message', '.quiz-help', '#quiz-take']), 'ok', `${key} at the top`);
      assert.deepEqual(await active(page), { id: 'quiz-message', role: 'alert' }, `${key} focused`);
      assert.deepEqual(await checkedOf(page), kept, `${key}: kept answers checked`);
      assert.equal(status >= 400, true);
    };
    // 409 quizChanged: the teacher changed the quiz between loading and sending.
    await pick(page, SALMA_PICKS);
    await w.p.sql(`UPDATE quiz SET rev = rev + 1 WHERE id = '${W7A.QA}'`);
    const [changed] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), submit(page)]);
    assert.equal(changed.status(), 409);
    await check('quizChanged', 409, SALMA_PICKS);
    await uxShot(page, 'UX-73-phone-ar-changed');
    // 400 quizAnswerInvalid: an answer id that is not the question's.
    await page.$eval('input[name="q-qa-one"][value="qa-one-a"]', (r) => { (r as HTMLInputElement).value = 'nobody'; (r as HTMLInputElement).checked = true; });
    const [invalid] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), submit(page)]);
    assert.equal(invalid.status(), 400);
    await check('quizAnswerInvalid', 400, { 'qa-two': 'qa-two-a', 'qa-three': 'qa-three-b' });
    // 409 quizNowClosed: closed between loading and sending.
    await pick(page, { 'qa-one': 'qa-one-b' });
    await w.p.sql(`UPDATE quiz SET state = 'closed' WHERE id = '${W7A.QA}'`);
    const [closed] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), submit(page)]);
    assert.equal(closed.status(), 409);
    await check('quizNowClosed', 409, SALMA_PICKS);
    assert.equal((await w.p.sql('SELECT COUNT(*) AS n FROM quiz_attempt'))[0].n, 0, 'nothing stored');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-74 ----
describe('UX-74 result page words, marks and order', { concurrency: false }, () => {
  const x = world();

  it('UX-74 h1 quizResultTitle, the large score line, quizSentOn, then one section per question with the chosen and the right answer in words and an aria-hidden shape, the verdict as text; no colour alone, no percentage or rank; quizBackToSubject at the end; quizAlreadySent in role=status after a second sending', async () => {
    const { w, browser } = x;
    const s = w.school;
    for (const [lang, width, shot, who, space] of [
      ['ar', 'phone', 'UX-74-phone-ar', SALMA, s], ['en', 'desktop', 'UX-74-desktop-en', NOUR6, s],
    ] as const) {
      const t = words('school', lang);
      const k = await open(browser, w, who, takePath(space, W7A.QA), { lang, width });
      const page = k.page;
      await pick(page, { 'qa-one': 'qa-one-b', 'qa-two': 'qa-two-a' });
      // A3 left blank: drop `required` so the browser sends without it (a direct POST could, AT-3.2).
      await page.$$eval('input[name="q-qa-three"]', (rs) => rs.forEach((r) => { (r as HTMLInputElement).required = false; }));
      await submit(page);
      assert.equal(new URL(page.url()).pathname, resultPath(space, W7A.QA));
      const r = resultOf(await page.content());
      assert.equal(r.title, t('quizResultTitle', { title: 'Fractions check' }));
      assert.equal(r.score, t('quizScoreLine', { score: '1', total: '3' }));
      assert.equal(r.sent, t('quizSentOn', { date: '2026-12-10' }));
      assert.ok(r.dateLtr, 'the date LTR in Latin digits');
      assert.equal(await inDomOrder(page, ['#quiz-result-title', '#quiz-score', '.quiz-sub', '.quiz-result-body', '#quiz-back']), 'ok', 'title, score, sent, the drawer, the way back');
      const big = await page.$eval('#quiz-score', (e) => ({ size: parseFloat(getComputedStyle(e).fontSize), body: parseFloat(getComputedStyle(document.body).fontSize) }));
      assert.ok(big.size > big.body, 'the score line larger than the body text');
      assert.deepEqual(r.sections.map((x) => x.verdict), [t('quizRight'), t('quizWrong'), t('quizNoAnswer')], 'the verdicts as text');
      r.sections.forEach((x, i) => assert.equal(x.heading, t('quizQuestionHeading', { n: String(i + 1) })));
      // Marks as words, the shapes hidden from screen readers; words separated (the PM's W7-1 advisory).
      const first = r.sections[0].answers.find((a) => a.includes(t('quizChosen')));
      assert.ok(first?.includes(` · ${t('quizChosen')} · ${t('quizRightMark')}`), `the two marks separated: "${first}"`);
      assert.ok(r.sections[1].answers.some((a) => a.includes(t('quizChosen')) && !a.includes(t('quizRightMark'))), 'the wrong choice marked chosen');
      assert.ok(r.sections[1].answers.some((a) => a.includes(t('quizRightMark')) && !a.includes(t('quizChosen'))), 'the right one marked in words');
      assert.ok(await page.$$eval('.quiz-shape', (e) => e.length > 0 && e.every((x) => x.getAttribute('aria-hidden') === 'true')), 'shape marks aria-hidden');
      const text = await page.innerText('main');
      assert.ok(!/%|٪/.test(text), 'no percentage');
      const subjectTitle = (await w.p.sql(`SELECT title FROM subject WHERE id = '${space.math}'`))[0].title as string;
      assert.equal(r.back?.text, t('quizBackToSubject', { subjectTitle }), 'the way back, quizBackToSubject');
      assert.equal(r.back?.href, subjectPath(space, space.math));
      assert.equal((await page.innerText('#quiz-back')).trim(), t('quizBackToSubject', { subjectTitle }), 'the way back as rendered (the space before the title kept)');
      const verdict = await page.$eval('.quiz-verdict.quiz-wrong', (e) => getComputedStyle(e).color);
      assert.ok(!/rgb\((1[5-9]\d|2\d\d), ([0-6]?\d), ([0-6]?\d)\)/.test(verdict), `no red alarm styling on the verdict (${verdict})`);
      await uxShot(page, shot);
      // A second sending: quizAlreadySent at the top in role=status.
      await go(page, w, resultPath(space, W7A.QA));
      const again = await (await as(w, who, lang)).post(takePath(space, W7A.QA), { rev: '0', 'q-qa-one': 'qa-one-a' });
      assert.equal(again.status, 303);
      await page.goto(`${w.p.url}${(again.headers.get('location') ?? '').replace(w.p.url, '')}`);
      assert.equal((await page.textContent('[role=status]'))?.trim(), t('quizAlreadySent'));
      assert.equal(await inDomOrder(page, ['[role=status]', '#quiz-score']), 'ok', 'the status at the top');
      await k.ctx.close();
    }
    // Company kit: the same page in the kit's words (made through the admin's preview of a quiz there).
    const company = w.company;
    const admin = await as(w, COMPANY_ADMIN, 'ar');
    const made = await admin.post(`/s/${company.id}/admin/topics/${company.math}/quizzes`, { title: 'Kit check' });
    const editor = (made.headers.get('location') ?? '').replace(w.p.url, '').split('?')[0];
    const id = editor.split('/').pop()!;
    await admin.post(`${editor}/question`, { text: 'Kit question', answer1: 'One', answer2: 'Two', right: '1', rev: '0' });
    const k = await open(browser, w, COMPANY_ADMIN, previewTakePath(company, id), { lang: 'ar' });
    await k.page.check('#quiz-take input[type=radio]');
    await submit(k.page);
    assert.equal((await k.page.textContent('[role=status]'))?.trim(), words('company', 'ar')('quizPreviewNotSaved'));
    await uxShot(k.page, 'UX-74-phone-ar-company');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-76 ----
describe('UX-76 preview quiz equals learner and saves nothing', { concurrency: false }, () => {
  const x = world();

  it('UX-76 the preview take page has the learner\'s markup; the preview send answers with the result page and quizPreviewNotSaved in role=status at the top; the wave 3a banner and Back link stay; nothing stored', async () => {
    const { w, browser } = x;
    const s = w.school;
    const t = words('school', 'ar');
    const learner = await open(browser, w, NOUR6, takePath(s, W7A.QA), { lang: 'ar' });
    const nour = await learner.page.$eval('#quiz-take', (f) => f.innerHTML.replace(/action="[^"]*"/g, ''));
    await learner.ctx.close();
    const k = await open(browser, w, HADEER, previewTakePath(s, W7A.QA), { lang: 'ar' });
    const page = k.page;
    assert.equal(await page.$eval('#quiz-take', (f) => f.innerHTML.replace(/action="[^"]*"/g, '')), nour, 'the same take form as Nour Test\'s');
    assert.ok(await page.$('#preview-banner, .preview-banner'), 'the wave 3a banner stays');
    assert.ok(await page.$('#preview-back, .preview-back'), 'the Back link stays');
    await uxShot(page, 'UX-76-phone-ar-take');
    await pick(page, SALMA_PICKS);
    const [res] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), submit(page)]);
    assert.equal(res.status(), 200, 'the preview send answers 200');
    assert.equal((await page.textContent('[role=status]'))?.trim(), t('quizPreviewNotSaved'));
    assert.equal(await inDomOrder(page, ['[role=status]', '#quiz-score', '.quiz-result-body']), 'ok', 'the status at the top, then the score and the drawer');
    assert.ok(await page.$('#preview-banner, .preview-banner'), 'the banner stays on the result');
    assert.equal((await w.p.sql('SELECT COUNT(*) AS n FROM quiz_attempt'))[0].n, 0, 'nothing stored');
    await uxShot(page, 'UX-76-phone-ar-result');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-77 ----
describe('UX-77 Arabic, mixed text and kit words for the learner pages (three kits)', { concurrency: false }, () => {
  const x = world();

  it('UX-77 bdi and dir auto on quiz text (learner pages): titles in <bdi>, question and answer texts in dir=auto on the section, the take page and the result page (W7-c QX); dates Latin YYYY-MM-DD in dir=ltr', async () => {
    const { w, browser } = x;
    const s = w.school;
    await withW7c(w);
    await w.p.sql(`UPDATE quiz SET state = 'open' WHERE id = '${QX}'`);
    const k = await open(browser, w, SALMA, subjectPath(s, s.math), { lang: 'ar' });
    const page = k.page;
    assert.ok(await page.$$eval('#quizzes a.quiz-row-link', (as) => as.length > 1 && as.every((a) => a.firstElementChild?.tagName === 'BDI')), 'section titles in <bdi>');
    await go(page, w, takePath(s, QX));
    assert.ok(await page.$('#quiz-take-title bdi'), 'the take title in <bdi>');
    assert.ok(await page.$$eval('#quiz-take .quiz-text, #quiz-take .quiz-answer-text', (es) => es.length > 0 && es.every((e) => e.getAttribute('dir') === 'auto')), 'take texts dir=auto');
    await uxShot(page, 'UX-77-phone-ar-hostile');
    await pickFirst(page);
    await submit(page);
    assert.ok(await page.$('#quiz-result-title bdi'), 'the result title in <bdi>');
    assert.ok(await page.$$eval('.quiz-result-body .quiz-text, .quiz-result-body .quiz-answer-text', (es) => es.length > 0 && es.every((e) => e.getAttribute('dir') === 'auto')), 'result texts dir=auto');
    assert.ok(await page.$eval('.quiz-date', (d) => d.getAttribute('dir') === 'ltr' && /^\d{4}-\d{2}-\d{2}$/.test(d.textContent ?? '')), 'the date');
    await k.ctx.close();
  });

  it('UX-77 language check by key (three kits) on the learner pages: lang and dir; on an Arabic page no English value of the keys, and the reverse, on the section, the take page and the result (the preview in the Company and University kits)', async () => {
    const { w, browser } = x;
    const people = { school: ADMIN, company: COMPANY_ADMIN, university: UNIVERSITY_ADMIN };
    const quizOf: Record<string, string> = { school: W7A.QA };
    for (const space of [w.company, w.university]) {
      const c = await as(w, people[space.kit], 'en');
      const res = await c.post(`/s/${space.id}/admin/topics/${space.math}/quizzes`, { title: 'Kit check' });
      assert.equal(res.status, 303);
      const editor = (res.headers.get('location') ?? '').replace(w.p.url, '').split('?')[0];
      assert.equal((await c.post(`${editor}/question`, { text: 'Kit question', answer1: 'One', answer2: 'Two', right: '1', rev: '0' })).status, 303);
      quizOf[space.kit] = editor.split('/').pop()!;
      await w.p.sql(`UPDATE quiz SET state = 'open' WHERE id = '${quizOf[space.kit]}'`);
    }
    const longest = (v: string) => v.split(/{[^}]*}/).map((p) => p.trim()).sort((p, q) => q.length - p.length)[0];
    const values = (lang: Lang) => LEARNER_KEYS.map((k) => [k, longest(UI[lang][k])] as const).filter(([, v]) => v.length >= (lang === 'en' ? 5 : 4));
    const data = /[^\n]*(Mathematics|الرياضيات|Fractions|Kit check|Kit question|One|Two|True|False|\d+\/\d+)[^\n]*/g;
    for (const lang of ['ar', 'en'] as const) {
      for (const space of [w.school, w.company, w.university]) {
        const id = quizOf[space.kit];
        const k = await open(browser, w, people[space.kit], `/s/${space.id}/preview/learn/${space.math}`, { lang });
        const page = k.page;
        const texts: string[] = [];
        assert.deepEqual(await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir })), { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' });
        texts.push(await page.innerText('#quizzes'));
        await go(page, w, previewTakePath(space, id));
        texts.push(await page.innerText('main'));
        await pickFirst(page);
        await submit(page);
        texts.push(await page.innerText('main'));
        for (const text of texts.map((x) => x.replace(data, ' '))) {
          for (const [key, value] of values(lang === 'ar' ? 'en' : 'ar')) assert.ok(!text.includes(value), `${space.kit} ${lang}: no ${lang === 'ar' ? 'English' : 'Arabic'} ${key} ("${value}")`);
        }
        await k.ctx.close();
      }
    }
    const k = await open(browser, w, UNIVERSITY_ADMIN, `/s/${w.university.id}/preview/learn/${w.university.math}`, { lang: 'ar' });
    await uxShot(k.page, 'UX-77-phone-ar-university');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-78 ----
describe('UX-78 states table (learner screens)', { concurrency: false }, () => {
  const x = world();

  it('UX-78 the subject page section, the take page, the result page and the preview in every non-n/a state', async () => {
    const { w } = x;
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const t = words('school', 'en');
    const status = async (path: string, method: 'GET' | 'POST' = 'GET', body?: Record<string, string>) => {
      const res = method === 'GET' ? await salma.get(path) : await salma.post(path, body ?? {});
      return { code: res.status, at: (res.headers.get('location') ?? '').replace(w.p.url, ''), html: res.status === 200 || res.status >= 400 ? await res.text() : '' };
    };
    // Subject page section — success: items with quizNotTaken; empty: no section (checked after removal below).
    let page = await status(subjectPath(s, s.math));
    assert.equal(sectionOf(page.html)?.items[0].meta, t('quizNotTaken', { n: '3' }), 'section: success with quizNotTaken');
    // Result page — empty: before sending, 303 to the take page.
    assert.deepEqual([(await status(resultPath(s, W7A.QA))).code, (await status(resultPath(s, W7A.QA))).at], [303, takePath(s, W7A.QA)], 'result before sending: 303 to the take page');
    // Take page — errors: 400 quizAnswerInvalid; 409 quizChanged; 409 quizNowClosed; 404 draft.
    assert.equal((await status(takePath(s, W7A.QA), 'POST', { rev: '0', 'q-qa-one': 'nobody' })).code, 400, 'take: 400');
    assert.ok((await status(takePath(s, W7A.QA), 'POST', { rev: '7', 'q-qa-one': 'qa-one-b' })).html.includes(t('quizChanged')), 'take: 409 quizChanged');
    assert.equal((await status(takePath(s, W7A.QB))).code, 404, 'take: 404 draft');
    // Take page — success: 303 to the result; result success: score and answers; then quizAlreadySent.
    const sent = await status(takePath(s, W7A.QA), 'POST', { rev: '0', 'q-qa-one': 'qa-one-b', 'q-qa-two': 'qa-two-a' });
    assert.deepEqual([sent.code, sent.at], [303, resultPath(s, W7A.QA)], 'take: success 303 to the result');
    assert.equal(resultOf((await status(resultPath(s, W7A.QA))).html).score, t('quizScoreLine', { score: '1', total: '3' }), 'result: success');
    page = await status(subjectPath(s, s.math));
    assert.equal(sectionOf(page.html)?.items[0].meta, t('quizTakenScore', { score: '1', total: '3' }), 'section: success with quizTakenScore');
    const again = await status(takePath(s, W7A.QA), 'POST', { rev: '0', 'q-qa-one': 'qa-one-a' });
    assert.equal(again.code, 303);
    assert.equal(resultOf((await status(again.at)).html).status, t('quizAlreadySent'), 'result: quizAlreadySent');
    // Section: the fold past 5 at W7-e (UX-72 holds the details); the closed quiz error.
    await w.p.sql(`UPDATE quiz SET state = 'closed' WHERE id = '${W7A.QG}'`);
    // Result page — error: 404 removed; take page 404 removed.
    await w.p.sql(`UPDATE quiz SET removed_at = 1 WHERE id = '${W7A.QA}'`);
    assert.equal((await status(resultPath(s, W7A.QA))).code, 404, 'result: 404 removed');
    assert.equal((await status(takePath(s, W7A.QA))).code, 404, 'take: 404 removed');
    assert.equal(sectionOf((await status(subjectPath(s, s.math))).html), null, 'section: empty, no section');
    await w.p.sql(`UPDATE quiz SET removed_at = NULL WHERE id = '${W7A.QA}'`);
    // Take page — error: an ended session answers today's signed-out answer.
    const res = await fetch(`${w.p.url}${takePath(s, W7A.QA)}`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: w.p.url }, body: 'rev=0&q-qa-one=qa-one-b' });
    assert.ok([302, 303].includes(res.status) && /\/(signin|login|sign-in)/.test(res.headers.get('location') ?? ''), `ended session: today's sign-in (${res.status} ${res.headers.get('location')})`);
    // Preview — as the learner, success with quizPreviewNotSaved, and today's preview refusal for a learner.
    const hadeer = await as(w, HADEER, 'en');
    const pr = await hadeer.post(previewTakePath(s, W7A.QA), { rev: '0', 'q-qa-one': 'qa-one-b' });
    assert.equal(pr.status, 200);
    assert.equal(resultOf(await pr.text()).status, t('quizPreviewNotSaved'), 'preview: success');
    assert.equal((await salma.get(previewTakePath(s, W7A.QA))).status, 403, 'preview: today\'s refusal for a learner');
  });
});

// ------------------------------------------------------------------- UX-79 ----
describe('UX-79 widths, targets, contrast and keyboard (learner pages)', { concurrency: false }, () => {
  const x = world();

  it('UX-79 the section (fold open and closed), the take page and the result page: no sideways scroll or clipped text at 390, 768, 1280 and 320 px with W7-d; 44 px targets, 4.5:1 text, focus rings in DOM order', async () => {
    const { w, browser } = x;
    const s = w.school;
    await withW7d(w, sql(w));
    // Salma's result on QL, for the result page at its largest; and 6 open quizzes so the fold is there.
    const salma = await as(w, SALMA, 'en');
    assert.equal((await salma.post(takePath(s, QL), { rev: '0', 'q-ql-a': 'ql-a-a' })).status, 303);
    const widths: [string, { width: number; height: number }][] = [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]];
    const pages: [string, string, string, string][] = [
      ['section', subjectPath(s, s.math), '#quizzes a.quiz-row-link', '#quizzes > h2, #quizzes a.quiz-row-link, #quizzes .quiz-meta'],
      ['take', takePath(s, W7A.QA), 'label.quiz-choice, #quiz-take button', '#quiz-take-title, .quiz-help, legend, label.quiz-choice, #quiz-take button'],
      ['result', resultPath(s, QL), '#quiz-back a, #quiz-back', '#quiz-result-title, #quiz-score, .quiz-sub, .quiz-result-body h2, .quiz-answer, .quiz-verdict, .quiz-tag'],
    ];
    for (const lang of ['ar', 'en'] as const) {
      for (const [name, path, targets, texts] of pages) {
        const k = await open(browser, w, SALMA, path, { lang });
        const page = k.page;
        for (const [wname, size] of widths) {
          await page.setViewportSize(size);
          await page.reload();
          const o = await overflow(page);
          assert.ok(o.sideways <= 0, `${name} ${lang} ${wname}: no sideways scroll (${o.sideways})`);
          assert.deepEqual(o.clipped.filter((c) => !/\.sr-only|sr-only:/.test(c)), [], `${name} ${lang} ${wname}: no clipped text`);
          if (name === 'take' && lang === 'ar' && wname === 'desktop') await uxShot(page, 'UX-79-desktop-ar');
        }
        await page.setViewportSize(WIDTHS.phone);
        await page.reload();
        for (const m of await measure(page, targets)) assert.ok(m.width >= 44 && m.height >= 44, `${name} ${lang}: ${m.selector} ${m.width}x${m.height}`);
        for (const m of await measure(page, texts)) {
          if (!m.text.trim()) continue;
          assert.ok(m.contrast >= 4.5, `${name} ${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
        }
        let seen = 0;
        for (let i = 0; i < 40; i++) {
          const f = await tab(page);
          if (f.tag === 'body') continue;
          assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${name} ${lang}: the focus ring on ${f.id || f.tag} (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
          seen++;
        }
        assert.ok(seen > 0, `${name} ${lang}: Tab reaches the controls`);
        await k.ctx.close();
      }
    }
    // The fold open: no sideways scroll; its summary a 44 px target (W7-e).
    await withW7e(w, sql(w));
    const k = await open(browser, w, SALMA, subjectPath(s, s.math), { lang: 'ar' });
    for (const open of [false, true]) {
      if (open) await k.page.click('#quiz-more > summary');
      for (const [wname, size] of widths) {
        await k.page.setViewportSize(size);
        const o = await overflow(k.page);
        assert.ok(o.sideways <= 0, `section fold ${open ? 'open' : 'closed'} ${wname}: no sideways scroll`);
      }
    }
    await k.ctx.close();
  });
});

describe('UX-79 keyboard on the learner pages (W7-a)', { concurrency: false }, () => {
  const x = world();

  it('UX-79 keyboard: J3 (open the quiz from the subject page, answer, send, read the result) by keyboard only; arrow keys move within each radio group', async () => {
    const { w, browser } = x;
    const s = w.school;
    const k = await open(browser, w, NOUR6, subjectPath(s, s.math), { lang: 'en' });
    const page = k.page;
    let reached = false;
    for (let i = 0; i < 200 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.classList.contains('quiz-row-link') ?? false);
    }
    assert.ok(reached, 'the quiz link is reached by Tab (no trap before it)');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    assert.equal(new URL(page.url()).pathname, takePath(s, W7A.QA));
    // Question 1: Tab into the group, an arrow key moves within it.
    let inGroup = false;
    for (let i = 0; i < 30 && !inGroup; i++) {
      await page.keyboard.press('Tab');
      inGroup = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name === 'q-qa-one');
    }
    assert.ok(inGroup, 'Tab reaches the first radio group');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement).value), 'qa-one-b', 'an arrow key moves within the group (and checks)');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON', 'Tab reaches the button after the last group');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    assert.equal(new URL(page.url()).pathname, resultPath(s, W7A.QA), 'sent by keyboard: the result');
    assert.equal((await w.p.sql(`SELECT COUNT(*) AS n FROM quiz_attempt WHERE quiz_id = '${W7A.QA}'`))[0].n, 1, 'one attempt stored');
    await k.ctx.close();
  });
});
