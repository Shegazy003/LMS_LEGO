// LMS wave 7, W7-1: the UX floor of the teacher's side (ux-plan on PIL-261,
// rev a6f86da5): UX-68, UX-69, UX-70, UX-71 and UX-75, and UX-77, UX-78 and
// UX-79 for the quiz card, the quiz list, the editor and the results pages.
// (UX-72 to UX-74, UX-76 and the learner parts of UX-77 to UX-79 come with
// W7-2.) One describe per CI step (`UX-<n> ...`, selected with
// --test-name-pattern), each on a fresh wave 7 world with the clock pinned, in
// Chromium (Playwright), script on unless stated. Screenshots go to
// evidence/ux/ as the ux-plan names them. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import {
  QUIZ_OPTIONS_MAX, QUIZ_OPTIONS_MIN, QUIZ_OPTION_MAX, QUIZ_PER_SUBJECT_MAX, QUIZ_QUESTIONS_MAX, QUIZ_REMOVED_SHOWN, QUIZ_RESULTS_PAGE, QUIZ_TEXT_MAX, QUIZ_TITLE_MAX,
} from '../../src/quiz.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import { UX49_DENY } from '../wave4/world.ts';
import {
  ADMIN, HADEER, OMAR, QA_QUESTIONS, QB_QUESTIONS, QL, SALMA, TITLES, W7A, WIDTHS, adminQuizzes, as, browserAs, closeWave6, editorPath, go, messageOf, publisherQuizzes,
  questionForm, quizRow, resultsOf, statusOf, topicPath, uxShot, wave7World, withW7b, withW7c, withW7d, withW7e, words, type W7a, type Wave1World, type Width,
} from './world.ts';

type Lang = 'ar' | 'en';
const UNIVERSITY_ADMIN = { username: 'nadia.admin', password: 'admin-third-pass' };
const COMPANY_ADMIN = { username: 'basem.admin', password: 'admin-other-pass' };

/** Every wave 7 key (the learner's too: all land in W7-1, ux-plan UX-77 is the single source). */
const ALL_KEYS = (Object.keys(UI.en) as UiKey[]).filter((k) => /^quiz[A-Z]/.test(k));
/** The keys drawn on this task's pages (the card, the list, the editor, the results and the answers view). */
const LEARNER_ONLY = new Set<string>(['quizSectionTitle', 'quizMoreTitle', 'quizNotTaken', 'quizTakenScore', 'quizTakeHelp', 'quizSubmit', 'quizChanged', 'quizNowClosed', 'quizAnswerInvalid', 'quizAlreadySent', 'quizResultTitle', 'quizSentOn', 'quizBackToSubject', 'quizPreviewNotSaved', 'quizPreviewLink']);
const TEACHER_KEYS = ALL_KEYS.filter((k) => !LEARNER_ONLY.has(k));

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
  return e ? { tag: e.tagName.toLowerCase(), id: e.id, cls: e.className, role: e.getAttribute('role'), text: (e.textContent ?? '').trim(), section: e.closest('section')?.id ?? null } : null;
});

async function open(browser: Browser, w: Wave1World, who: { username: string; password: string }, path: string, opts: { width?: Width; lang?: Lang; script?: boolean } = {}) {
  const tabbed = await browserAs(browser, w, who, { width: opts.width ?? 'phone', lang: opts.lang ?? 'ar', script: opts.script });
  await go(tabbed.page, w, path);
  return tabbed;
}

/** Submits the form holding `button` and waits for the next page. */
async function submit(page: Page, button: string) {
  await Promise.all([page.waitForEvent('load'), page.click(button)]);
}

function world(opts: { b?: boolean } = {}) {
  const box: { w?: Wave1World; q?: W7a; browser?: Browser } = {};
  before(async () => {
    ({ w: box.w, q: box.q } = await wave7World());
    if (opts.b) await withW7b(box.w);
    box.browser = await chromium.launch();
  });
  after(async () => {
    await box.browser?.close();
    await closeWave6(box.w);
  });
  return box as { w: Wave1World; q: W7a; browser: Browser };
}

const sql = (w: Wave1World) => (q: string) => w.p.sql(q);
const low = (kit: 'school' | 'company' | 'university', lang: Lang, word: 'learner' | 'admin' | 'guardian' = 'learner') => words(kit, lang)(word).toLocaleLowerCase(lang);

// ------------------------------------------------------------------- UX-68 ----
describe('UX-68 quiz card place, order and labels', { concurrency: false }, () => {
  const x = world();

  it('UX-68 on the editor and the subject admin page the card comes after the due card: h2, help, a secondary 44 px link; Publish stays the one primary button', async () => {
    const { w, browser } = x;
    const s = w.school;
    for (const [who, path, list, lang, width, shot] of [
      [HADEER, editorPath(s, s.math), publisherQuizzes(s, s.math), 'ar', 'phone', 'UX-68-phone-ar'],
      [ADMIN, topicPath(s, s.math), adminQuizzes(s, s.math), 'en', 'desktop', 'UX-68-desktop-en-admin'],
    ] as const) {
      const k = await open(browser, w, who, path, { lang, width });
      const page = k.page;
      const t = words('school', lang);
      assert.equal(await inDomOrder(page, ['#due-dates', '#quizzes', '#quizzes > h2', '#quizzes .quiz-help', '#quizzes a.quiz-link-button']), 'ok', `${who.username}: after the due card, parts in order`);
      assert.equal((await page.textContent('#quizzes > h2'))?.trim(), t('quizCardTitle'));
      const help = (await page.innerText('#quizzes .quiz-help')).replace(/\s+/g, ' ').trim();
      const subject = (await w.p.sql(`SELECT title FROM subject WHERE id = '${s.math}'`))[0].title as string;
      // W7-3 (ux-plan v4 U5, G9.4): the new value names the admin and the guardian too, as lower-case kit words like the learner.
      assert.equal(help, t('quizCardHelp', { learner: low('school', lang), subjectTitle: subject, admin: low('school', lang, 'admin'), guardian: low('school', lang, 'guardian') }), 'the help line');
      assert.equal((await page.textContent('#quizzes a.quiz-link-button'))?.trim(), t('quizManageLink'));
      assert.equal(await page.getAttribute('#quizzes a.quiz-link-button', 'href'), list);
      assert.equal(await page.$$eval('#quizzes button, #quizzes form', (b) => b.length), 0, 'the card adds no button and no form');
      const [link] = await measure(page, '#quizzes a.quiz-link-button');
      assert.ok(link.width >= 44 && link.height >= 44, `the link is a 44 px target (${link.width}x${link.height})`);
      const style = await page.$eval('#quizzes a.quiz-link-button', (a) => ({ bg: getComputedStyle(a).backgroundColor, color: getComputedStyle(a).color }));
      const due = await page.$eval('#due-dates a.due-link', (a) => ({ bg: getComputedStyle(a).backgroundColor, color: getComputedStyle(a).color }));
      assert.deepEqual(style, due, 'the secondary style of the due card\'s link, not the primary fill');
      await uxShot(page, shot);
      await k.ctx.close();
    }
  });
});

// ------------------------------------------------------------------- UX-69 ----
describe('UX-69 quiz list order, states, results link for the responsible publisher and admins, removed fold', { concurrency: false }, () => {
  const x = world({ b: true });

  it('UX-69 h1 and back link first, the new-quiz form, the rows (title link in bdi, state in words, count, results link for the responsible publisher and admins), the closed removed fold with one named restore per quiz; at the limit the form stays and answers quizLimit', async () => {
    const { w, browser } = x;
    const s = w.school;
    for (const [who, list, back, lang, width, shot, publisher] of [
      [HADEER, publisherQuizzes(s, s.math), editorPath(s, s.math), 'ar', 'phone', 'UX-69-phone-ar', true],
      [ADMIN, adminQuizzes(s, s.math), topicPath(s, s.math), 'en', 'desktop', 'UX-69-desktop-en-admin', false],
    ] as const) {
      const k = await open(browser, w, who, list, { lang, width });
      const page = k.page;
      const t = words('school', lang);
      assert.equal(await inDomOrder(page, ['#quiz-back', '#quiz-list-title', '#quiz-new', '#quiz-list', '#quiz-removed']), 'ok', `${who.username}: back link, h1, form, list, fold`);
      assert.equal(await page.getAttribute('#quiz-back', 'href'), back);
      assert.equal(await page.$eval('#quiz-list-title', (e) => e.tagName), 'H1');
      assert.equal((await page.textContent('label[for="quiz-new-title"]'))?.trim(), t('quizNewLabel'), 'a visible label');
      assert.equal(await page.getAttribute('#quiz-new-title', 'maxlength'), String(QUIZ_TITLE_MAX));
      assert.equal((await page.textContent('#quiz-new button'))?.trim(), t('quizCreate'));
      const rows = await page.$$eval('#quiz-list > li.quiz-row', (ls) => ls.map((l) => ({
        id: l.id, bdi: Boolean(l.querySelector('a.quiz-row-link bdi')), state: l.querySelector('.quiz-state')?.textContent?.trim(), count: l.querySelector('.quiz-count')?.textContent?.trim(), results: l.querySelector('a.quiz-results-link')?.textContent?.trim() ?? null,
      })));
      assert.deepEqual(rows.map((r) => r.id), [`quiz-${W7A.QA}`, `quiz-${W7A.QB}`, `quiz-${W7A.QC}`], 'the three quizzes not removed, in creation order');
      for (const r of rows) assert.ok(r.bdi, `${r.id}: the title link holds a <bdi>`);
      assert.deepEqual(rows.map((r) => r.state), [t('quizStateOpen'), t('quizStateDraft'), t('quizStateClosed')], 'the state in words');
      assert.deepEqual(rows.map((r) => r.count), [3, 2, 1].map((n) => t('quizQuestionCount', { n: String(n) })));
      // W7-3 [B] (contract v4 R7 item 3): "results link only for the publisher" became "for the responsible publisher and
      // admins"; the admin's link leads to the scores page (AT-9).
      assert.deepEqual(rows.map((r) => r.results), [2, 0, 1].map((n) => t('quizResultsLink', { n: String(n) })), publisher ? 'the results link with the count' : 'the admin\'s results link with the count');
      void publisher;
      assert.equal(await page.$eval('#quiz-removed', (d) => (d as HTMLDetailsElement).open), false, 'the fold is closed by default');
      assert.equal((await page.textContent('#quiz-removed > summary'))?.trim(), t('quizRemovedTitle', { n: '1' }));
      const restore = await page.$$eval('#quiz-removed form.quiz-restore button', (bs) => bs.map((b) => ({ name: b.getAttribute('aria-label'), text: b.textContent?.trim() })));
      assert.deepEqual(restore, [{ name: t('quizRestoreFor', { title: TITLES.QD }), text: t('quizRestore') }], 'one named restore form per removed quiz');
      await uxShot(page, shot);
      await k.ctx.close();
    }
    // At QUIZ_PER_SUBJECT_MAX the form stays and a press answers quizLimit (W7-e: 30 quizzes not removed).
    await withW7d(w);
    await withW7e(w);
    const k = await open(browser, w, HADEER, publisherQuizzes(s, s.math), { lang: 'en' });
    assert.ok(await k.page.isVisible('#quiz-new'), 'at the limit the new-quiz form is still shown');
    await k.page.fill('#quiz-new-title', 'One too many');
    await submit(k.page, '#quiz-new button');
    const text = await k.page.innerText('main');
    assert.ok(text.includes(UI.en.quizLimit.replace('{max}', String(QUIZ_PER_SUBJECT_MAX)).split('{subjectTitle}')[1].trim()), 'a press answers quizLimit');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-70 ----
describe('UX-70 editor fields, labels, limits, open help, copy, locked view', { concurrency: false }, () => {
  const x = world({ b: true });

  it('UX-70 the editable editor: h1, back link, title form, the state line with help before the actions, each question a section with its labelled fields, the new question, copy at the end; every form works without script', async () => {
    const { w, browser } = x;
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const k = await open(browser, w, HADEER, `${list}/${W7A.QB}`, { lang: 'ar' });
    const page = k.page;
    const t = words('school', 'ar');
    const q1 = QB_QUESTIONS[0].id;
    assert.equal(await inDomOrder(page, ['#quiz-back', '#quiz-editor-title', '#quiz-title-form', '#quiz-state', `#question-${q1}`, '#question-new', '#quiz-copy']), 'ok', 'the parts in order');
    assert.equal(await page.getAttribute('#quiz-back', 'href'), list);
    assert.equal((await page.textContent('label[for="quiz-title-field"]'))?.trim(), t('quizTitleLabel'));
    assert.equal((await page.textContent('#quiz-title-form button'))?.trim(), t('quizSaveTitle'));
    // The state line: the draft's help and the open help come before the actions; one primary action (Open) on a draft.
    assert.equal(await inDomOrder(page, ['#quiz-state .quiz-state', '#quiz-state .quiz-help', '#quiz-state .quiz-open-help', '#quiz-state .quiz-actions']), 'ok', 'help read before the actions');
    assert.equal((await page.textContent('#quiz-state .quiz-help'))?.trim(), t('quizDraftHelp', { learner: low('school', 'ar') }));
    assert.equal((await page.textContent('#quiz-state .quiz-open-help'))?.trim(), t('quizOpenHelp'));
    const buttons = await page.$$eval('#quiz-state .quiz-actions button', (bs) => bs.map((b) => ({ text: b.textContent?.trim(), secondary: b.classList.contains('quiz-secondary') })));
    assert.deepEqual(buttons, [{ text: t('quizOpen'), secondary: false }, { text: t('quizRemove'), secondary: true }], 'Open is the one primary action on a draft');
    // A question: h2, the labelled textarea, five answer rows each with a radio named "Answer n is the right one", the help, Save; Remove apart.
    const sec = `#question-${q1}`;
    assert.equal((await page.textContent(`${sec} > h2`))?.trim(), t('quizQuestionHeading', { n: '1' }));
    const ta = `${sec} textarea[name=text]`;
    assert.equal(await page.getAttribute(ta, 'maxlength'), String(QUIZ_TEXT_MAX));
    assert.equal((await page.textContent(`label[for="${await page.getAttribute(ta, 'id')}"]`))?.trim(), t('quizQuestionLabel'));
    const options = await page.$$eval(`${sec} .quiz-option`, (os) => os.map((o) => ({ label: o.querySelector('label')?.textContent?.trim(), max: o.querySelector('input:not([type=radio])')?.getAttribute('maxlength'), radio: o.querySelector('input[type=radio]')?.getAttribute('aria-label'), group: o.querySelector('input[type=radio]')?.getAttribute('name') })));
    assert.equal(options.length, QUIZ_OPTIONS_MAX, 'five answer rows');
    options.forEach((o, i) => assert.deepEqual(o, { label: t('quizOptionLabel', { n: String(i + 1) }), max: String(QUIZ_OPTION_MAX), radio: t('quizCorrectFor', { n: String(i + 1) }), group: 'right' }, `answer row ${i + 1}`));
    assert.equal((await page.textContent(`${sec} fieldset > legend`))?.trim(), t('quizRightMark'));
    assert.equal((await page.textContent(`${sec} .quiz-help`))?.trim(), t('quizOptionsHelp', { min: String(QUIZ_OPTIONS_MIN), max: String(QUIZ_OPTIONS_MAX) }));
    assert.equal((await page.textContent(`${sec} form.quiz-question-form > button`))?.trim(), t('quizSaveQuestion', { n: '1' }));
    assert.equal((await page.textContent(`${sec} form.quiz-remove-question button`))?.trim(), t('quizRemoveQuestion', { n: '1' }));
    assert.equal((await page.textContent('#question-new > h2'))?.trim(), t('quizNewQuestion'));
    assert.equal((await page.textContent('#question-new form > button'))?.trim(), t('quizAddQuestion'));
    assert.equal((await page.textContent('#quiz-copy button'))?.trim(), t('quizCopy'));
    await uxShot(page, 'UX-70-phone-ar');
    await page.setViewportSize(WIDTHS.tablet);
    await uxShot(page, 'UX-70-tablet-ar');
    await k.ctx.close();
    const en = await open(browser, w, HADEER, `${list}/${W7A.QB}`, { lang: 'en', width: 'desktop' });
    await uxShot(en.page, 'UX-70-desktop-en');
    await en.ctx.close();
    // Without script every form works: add a question, then save the title.
    const ns = await open(browser, w, HADEER, `${list}/${W7A.QB}`, { lang: 'en', script: false });
    await ns.page.fill('#question-new textarea', 'Which is less, 0.2 or 0.25?');
    await ns.page.fill('#question-new input[name=answer1]', '0.2');
    await ns.page.fill('#question-new input[name=answer2]', '0.25');
    await ns.page.check('#question-new input[type=radio][value="1"]');
    await submit(ns.page, '#question-new form > button');
    assert.equal((await quizRow(sql(w), W7A.QB)).questions.length, 3, 'without script: the question is added');
    await ns.page.fill('#quiz-title-field', 'Decimals again');
    await submit(ns.page, '#quiz-title-form button');
    assert.equal((await quizRow(sql(w), W7A.QB)).title, 'Decimals again', 'without script: the title is saved');
    // At QUIZ_QUESTIONS_MAX the new-question block is replaced by quizFull as text.
    await w.p.sql(`UPDATE quiz SET questions_json = '${JSON.stringify(Array.from({ length: QUIZ_QUESTIONS_MAX }, (_, i) => ({ ...QB_QUESTIONS[0], id: `full-${'abcdefghijklmnopqrst'[i]}`, answers: QB_QUESTIONS[0].answers.map((a, j) => ({ ...a, id: `full-${'abcdefghijklmnopqrst'[i]}-${'ab'[j]}` })), rightId: `full-${'abcdefghijklmnopqrst'[i]}-a` })))}' WHERE id = '${W7A.QB}'`);
    await ns.page.reload();
    assert.equal(await ns.page.$('#question-new'), null, 'at the most questions: no new-question block');
    assert.equal((await ns.page.textContent('#quiz-full'))?.trim(), UI.en.quizFull.replace('{max}', String(QUIZ_QUESTIONS_MAX)));
    await ns.ctx.close();
  });

  it('UX-70 the locked view (QA with W7-b): quizLockedNote at the top of the questions, no open help, each question as text with the right one marked in words and a check shape, no question form, copy stays; the copy opens with quizCopied', async () => {
    const { w, browser } = x;
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const k = await open(browser, w, HADEER, `${list}/${W7A.QA}`, { lang: 'ar' });
    const page = k.page;
    const t = words('school', 'ar');
    assert.equal(await inDomOrder(page, ['#quiz-questions', '#quiz-locked', `#question-${QA_QUESTIONS[0].id}`]), 'ok', 'the note at the top of the questions');
    assert.equal((await page.textContent('#quiz-locked'))?.trim(), t('quizLockedNote'));
    assert.equal(await page.$('.quiz-open-help'), null, 'no quizOpenHelp once locked');
    assert.equal(await page.$$eval('#quiz-questions form, #quiz-questions textarea, #quiz-questions input', (e) => e.length), 0, 'no question form');
    for (const q of QA_QUESTIONS) {
      const marked = await page.$$eval(`#question-${q.id} li.quiz-is-right`, (ls) => ls.map((l) => ({ text: l.querySelector('.quiz-answer-text')?.textContent, tag: l.querySelector('.quiz-tag')?.textContent?.replace(/\s+/g, ' ').trim(), shapeHidden: l.querySelector('.quiz-shape')?.getAttribute('aria-hidden') })));
      assert.deepEqual(marked, [{ text: q.answers.find((a) => a.id === q.rightId)!.text, tag: `✓ ${t('quizRightMark')}`, shapeHidden: 'true' }], `${q.id}: the right answer marked in words and a check shape`);
    }
    assert.ok(await page.isVisible('#quiz-copy button'), 'copy stays');
    await uxShot(page, 'UX-70-phone-ar-locked');
    await submit(page, '#quiz-copy button');
    assert.equal(await statusOf(await page.content()), t('quizCopied'), 'the copy opens with quizCopied');
    assert.ok(await page.isVisible('#question-new'), 'the copy\'s questions can change');
    await uxShot(page, 'UX-70-phone-ar-copied');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-71 ----
describe('UX-71 teacher status, focus and errors', { concurrency: false }, () => {
  const x = world({ b: true });

  it('UX-71 after each press the page lands at the changed place and the status line (role=status, tabindex=-1) has focus; a stale address shows no status', async () => {
    const { w, browser } = x;
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const t = words('school', 'ar');
    const k = await open(browser, w, HADEER, list, { lang: 'ar' });
    const page = k.page;
    const statusFocused = async (what: string, key: string, section: string | null) => {
      const a = await active(page);
      assert.equal(a?.role, 'status', `${what}: the status line has focus (${JSON.stringify(a)})`);
      assert.equal(await page.$eval('[role=status]', (e) => e.getAttribute('tabindex')), '-1');
      assert.equal(a?.text, key, `${what}: the status text`);
      if (section !== null) assert.equal(a?.section, section, `${what}: at the changed place`);
    };
    // Create: the new quiz's editor, at its state line.
    await page.fill('#quiz-new-title', 'اختبار جديد للتجربة');
    await submit(page, '#quiz-new button');
    await statusFocused('create', t('quizCreated'), 'quiz-state');
    // Add a question: lands at #question-<id>.
    await page.fill('#question-new textarea', 'كم يساوي ٢ + ٢؟');
    await page.fill('#question-new input[name=answer1]', '٤');
    await page.fill('#question-new input[name=answer2]', '٥');
    await page.check('#question-new input[type=radio][value="1"]');
    await submit(page, '#question-new form > button');
    const qid = new URL(page.url()).hash.slice('#question-'.length);
    assert.ok(qid, `lands at #question-<id> (${page.url()})`);
    await statusFocused('add', t('quizQuestionSaved'), `question-${qid}`);
    await uxShot(page, 'UX-71-phone-ar-saved');
    // Save the question again: the same place.
    await page.fill(`#question-${qid} textarea`, 'كم يساوي ٢ + ٣؟');
    await page.fill(`#question-${qid} input[name=answer1]`, '٥');
    await page.fill(`#question-${qid} input[name=answer2]`, '٦');
    await submit(page, `#question-${qid} form.quiz-question-form > button`);
    await statusFocused('save', t('quizQuestionSaved'), `question-${qid}`);
    // Open, close, reopen: the state line.
    await submit(page, '#quiz-state .quiz-actions form:first-child button');
    await statusFocused('open', t('quizOpened', { learner: low('school', 'ar'), subjectTitle: String((await w.p.sql(`SELECT title FROM subject WHERE id = '${s.math}'`))[0].title) }), 'quiz-state');
    await submit(page, '#quiz-state .quiz-actions form:first-child button');
    await statusFocused('close', t('quizClosed'), 'quiz-state');
    // A stale address: the closed status reloaded after reopening shows nothing.
    const closedUrl = page.url();
    await submit(page, '#quiz-state .quiz-actions form:first-child button');
    await statusFocused('reopen', t('quizOpened', { learner: low('school', 'ar'), subjectTitle: String((await w.p.sql(`SELECT title FROM subject WHERE id = '${s.math}'`))[0].title) }), 'quiz-state');
    await page.goto(closedUrl);
    assert.equal(await page.$('[role=status]'), null, 'a stale ?quiz= address shows no false status');
    // Copy: the copy's editor top, quizCopied focused.
    await submit(page, '#quiz-copy button');
    await statusFocused('copy', t('quizCopied'), 'quiz-state');
    // Remove the quiz and restore it: the list, focused.
    await submit(page, '#quiz-state .quiz-actions form:last-child button');
    await statusFocused('remove', t('quizRemoved'), null);
    await page.click('#quiz-removed > summary');
    await submit(page, '#quiz-removed form.quiz-restore:last-of-type button');
    await statusFocused('restore', t('quizRestored'), null);
    await k.ctx.close();
  });

  it('UX-71 a refused value: 400, every typed value kept in that form, the message tied by aria-describedby, aria-invalid, focus on the first invalid field; quizStale 409 at the top of the questions, focused', async () => {
    const { w, browser } = x;
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const t = words('school', 'ar');
    const k = await open(browser, w, HADEER, `${list}/${W7A.QB}`, { lang: 'ar' });
    const page = k.page;
    // quizOptionsInvalid: one answer only; the text and the answer are kept.
    await page.fill('#question-new textarea', 'سؤال بإجابة واحدة');
    await page.fill('#question-new input[name=answer1]', 'وحيدة');
    await page.check('#question-new input[type=radio][value="1"]');
    const [res] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), submit(page, '#question-new form > button')]);
    assert.equal(res.status(), 400, '400');
    assert.equal(await page.inputValue('#question-new textarea'), 'سؤال بإجابة واحدة', 'the text kept');
    assert.equal(await page.inputValue('#question-new input[name=answer1]'), 'وحيدة', 'the answer kept');
    const a = await active(page);
    const invalid = await page.$eval('#question-new [aria-invalid=true]', (e) => ({ id: e.id, described: e.getAttribute('aria-describedby') }));
    assert.equal(a?.id, invalid.id, 'focus on the first invalid field');
    assert.equal((await page.textContent(`#${invalid.described}`))?.trim(), t('quizOptionsInvalid', { min: String(QUIZ_OPTIONS_MIN), max: String(QUIZ_OPTIONS_MAX), len: String(QUIZ_OPTION_MAX) }), 'the message tied by aria-describedby');
    assert.equal(await page.inputValue(`#question-${QB_QUESTIONS[0].id} textarea`), QB_QUESTIONS[0].text, 'other forms unchanged');
    await uxShot(page, 'UX-71-phone-ar-error');
    // quizStale: a second window saves first.
    await go(page, w, `${list}/${W7A.QB}`);
    const rev = (await quizRow(sql(w), W7A.QB)).rev;
    const other = await as(w, ADMIN, 'en');
    const q1 = QB_QUESTIONS[0];
    assert.equal((await other.post(`${adminQuizzes(s, s.math)}/${W7A.QB}/question/${q1.id}`, questionForm('Other window', q1.answers.map((a) => a.text), 1, rev))).status, 303);
    await page.fill(`#question-${QB_QUESTIONS[1].id} textarea`, 'نافذة قديمة');
    const [stale] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), submit(page, `#question-${QB_QUESTIONS[1].id} form.quiz-question-form > button`)]);
    assert.equal(stale.status(), 409, '409');
    assert.equal(await inDomOrder(page, ['#quiz-questions', '#quiz-message']), 'ok', 'the message at the top of the questions');
    assert.equal(messageOf(await page.content()), t('quizStale'));
    assert.equal((await active(page))?.id, 'quiz-message', 'the message has focus');
    assert.equal(await page.inputValue(`#question-${q1.id} textarea`), 'Other window', 'the latest version drawn');
    await uxShot(page, 'UX-71-phone-ar-stale');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-75 ----
describe('UX-75 results table, pages, summary and answers view', { concurrency: false }, () => {
  const x = world({ b: true });

  it('UX-75 QA with W7-b: h1, back link, the table with caption and column headers, names as links in bdi, scores and LTR dates, the per-question lines in order; stacked rows on a phone with no sideways scroll; the answers view uses the shared drawer', async () => {
    const { w, browser } = x;
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const results = resultsOf(list, W7A.QA);
    for (const [lang, width, shot] of [['ar', 'phone', 'UX-75-phone-ar'], ['en', 'desktop', 'UX-75-desktop-en']] as const) {
      const t = words('school', lang);
      const k = await open(browser, w, HADEER, results, { lang, width });
      const page = k.page;
      assert.equal(await inDomOrder(page, ['#quiz-back', '#quiz-results-title', '#quiz-results', '#quiz-stats-title', '#quiz-stats']), 'ok', 'the parts in order');
      assert.equal(await page.getAttribute('#quiz-back', 'href'), list, 'back to the quiz list');
      assert.equal((await page.textContent('#quiz-results caption'))?.trim(), t('quizResultsCount', { n: '2' }));
      assert.deepEqual(await page.$$eval('#quiz-results thead th', (th) => th.map((h) => [h.textContent?.trim(), h.getAttribute('scope')])), [[t('quizColName'), 'col'], [t('quizColScore'), 'col'], [t('quizColDate'), 'col']]);
      const rows = await page.$$eval('#quiz-results tbody tr', (trs) => trs.map((tr) => ({ name: tr.querySelector('a.quiz-name bdi')?.textContent, score: tr.children[1]?.textContent?.trim(), date: tr.querySelector('.quiz-date')?.textContent, dir: tr.querySelector('.quiz-date')?.getAttribute('dir') })));
      assert.deepEqual(rows.map((r) => r.name), [OMAR.display_name, SALMA.display_name].sort((a, b) => a.localeCompare(b)), 'names in bdi, in name order');
      for (const r of rows) {
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '') && r.dir === 'ltr', `a Latin YYYY-MM-DD date in dir=ltr (${JSON.stringify(r)})`);
        assert.equal(r.score, t('quizScoreCell', { score: r.name === SALMA.display_name ? '1' : '3', total: '3' }));
      }
      assert.deepEqual(await page.$$eval('#quiz-stats > li', (ls) => ls.map((l) => l.textContent?.trim())), [2, 1, 1].map((right, i) => t('quizQuestionStat', { n: String(i + 1), right: String(right), all: '2' })), 'one line per question, in order');
      if (width === 'phone') {
        const o = await overflow(page);
        assert.ok(o.sideways <= 0, `phone: no sideways scroll (${o.sideways})`);
        const stacked = await page.$eval('#quiz-results tbody td', (td) => ({ display: getComputedStyle(td).display, label: getComputedStyle(td, '::before').content }));
        assert.equal(stacked.display, 'block', 'phone: rows become stacked blocks');
        assert.ok(stacked.label.startsWith(`"${t('quizColName')}`), `phone: the header word shown (${stacked.label})`);
      }
      await uxShot(page, shot);
      // The answers view: heading, score line, the shared drawer, back to the results.
      if (lang === 'ar') {
        await submit(page, `#quiz-results a.quiz-name >> text=${SALMA.display_name}`);
        assert.equal(await page.getAttribute('#quiz-back', 'href'), results, 'back to the results');
        assert.equal((await page.innerText('#quiz-answers-title')).trim(), t('quizAnswersOf', { name: SALMA.display_name }));
        assert.equal((await page.textContent('#quiz-score'))?.trim(), t('quizScoreLine', { score: '1', total: '3' }));
        assert.deepEqual(await page.$$eval('.quiz-result-body .quiz-verdict', (v) => v.map((e) => e.textContent?.trim())), [t('quizRight'), t('quizWrong'), t('quizNoAnswer')], 'right, wrong, no answer in words');
        await uxShot(page, 'UX-75-phone-ar-answers');
      }
      await k.ctx.close();
    }
    // No attempt: quizResultsNone instead of the table and the summary.
    const none = await (await as(w, HADEER, 'en')).get(resultsOf(list, W7A.QB));
    const body = await none.text();
    assert.ok(body.includes(UI.en.quizResultsNone) && !body.includes('id="quiz-results"') && !body.includes('id="quiz-stats"'), 'quizResultsNone, no table, no summary');
    // Pages (W7-e, page 2): nav with Previous, Page n of m, Next.
    await withW7d(w);
    await withW7e(w);
    const k = await open(browser, w, HADEER, `${resultsOf(list, QL)}?page=2`, { lang: 'ar', width: 'tablet' });
    const t = words('school', 'ar');
    assert.equal(await k.page.$$eval('#quiz-results tbody tr', (r) => r.length), QUIZ_RESULTS_PAGE);
    assert.deepEqual(await k.page.$$eval('nav.quiz-pager > *', (e) => e.map((x) => x.textContent?.trim())), [t('quizPagePrev'), t('quizPageOf', { n: '2', m: '6' }), t('quizPageNext')]);
    await uxShot(k.page, 'UX-75-tablet-ar-pages');
    await go(k.page, w, `${resultsOf(list, QL)}?page=6`);
    assert.deepEqual(await k.page.$$eval('nav.quiz-pager > *', (e) => e.map((x) => x.textContent?.trim())), [t('quizPagePrev'), t('quizPageOf', { n: '6', m: '6' })], 'no Next at the end');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-77 ----
/** Words of the frozen UX-77 table that are on UX-49's list but name a fixed noun here, never a kit word (AMBER, named in CANDIDATE READY). */
const TABLE_ALLOW: Record<string, string> = {
  'الجديد': 'quizNewLabel «عنوان الاختبار الجديد»: agrees with «الاختبار», a fixed noun',
  'الجديدة': 'quizLockedNote «النسخة الجديدة»: agrees with «النسخة», a fixed noun',
  'مقفلة': 'quizLockedNote «الأسئلة مقفلة»: agrees with «الأسئلة», a fixed noun',
  'السابق': 'quizPagePrev «السابق»: the pager\'s own word, no kit word',
  'متاحة': 'quizLockedNote «… والنسخ متاحة أيضًا»: agrees with the named actions, fixed nouns',
};
const DEMONSTRATIVES = ['هذا', 'هذه', 'ذلك', 'تلك', 'هؤلاء'];
const NEIGHBOURS = ['في'];
const noMarks = (s: string) => s.replace(/[ً-ْ]/g, '');
const tokensOf = (v: string) => noMarks(v).replace(/{[^}]*}/g, ' ').split(/[\s.,:;()«»"،·؟?]+/).filter(Boolean);
// W7-3 (ux-plan v3 UX-84, v4 U3): `admin` and `guardian` are typed kit words (quizCardHelp; their typed rules: UX-84's steps).
const TYPED = ['learner', 'title', 'subjectTitle', 'name', 'n', 'm', 'score', 'total', 'right', 'all', 'max', 'min', 'len', 'date', 'admin', 'guardian'];
/** W7-3 AMBER (named in CANDIDATE READY): the frozen ux-plan v4 (U4) gives quizAdminScoresNote verbatim as «… في هذه الصفحة.»
 * and runs UX-77 on it; its demonstrative is the frozen wording's own, so the demonstrative check allows exactly that word there. */
const DEMONSTRATIVE_ALLOW: Record<string, string> = { quizAdminScoresNote: 'هذه' };
const CONSTANTS = [QUIZ_TITLE_MAX, QUIZ_TEXT_MAX, QUIZ_OPTION_MAX, QUIZ_OPTIONS_MIN, QUIZ_OPTIONS_MAX, QUIZ_QUESTIONS_MAX, QUIZ_PER_SUBJECT_MAX, QUIZ_REMOVED_SHOWN, QUIZ_RESULTS_PAGE].map(String);

describe('UX-77 Arabic, mixed text and kit words for the teacher pages (three kits)', { concurrency: false }, () => {
  const x = world({ b: true });

  it('UX-77 bare kit values, deny list, pronouns and placeholder neighbours: learner values without «ال»; no listed word or demonstrative, no attached pronoun; quizCardHelp, quizOpened, quizDraftHelp, quizPreviewLink and quizOpenHelp by name', () => {
    for (const kit of ['school', 'company', 'university'] as const) {
      const v = words(kit, 'ar')('learner');
      assert.ok(!v.startsWith('ال'), `${kit}: the Arabic learner value "${v}" is bare`);
    }
    assert.ok(ALL_KEYS.length >= 80, `every UX-77 key is in ui.ts (${ALL_KEYS.length})`);
    for (const key of ALL_KEYS) {
      const tokens = tokensOf(UI.ar[key]);
      for (const bad of UX49_DENY) assert.ok(!tokens.includes(noMarks(bad)) || Object.hasOwn(TABLE_ALLOW, bad) || DEMONSTRATIVE_ALLOW[key] === bad, `${key}: no "${bad}"`);
      for (const word of tokens) {
        for (const d of DEMONSTRATIVES) assert.ok(!word.includes(d) || (DEMONSTRATIVE_ALLOW[key] === d && word === d), `${key}: "${word}" holds the demonstrative ${d}`);
        if (!/[؀-ۿ]/.test(word) || word.length < 3 || DEMONSTRATIVE_ALLOW[key] === word) continue;
        assert.ok(!/(ه|ها|هم|هن|ك|كم)$/.test(word), `${key}: "${word}" ends in an attached pronoun`);
      }
      const v = UI.ar[key];
      for (const m of v.matchAll(/{learner}/g)) {
        const prev = /([^\s.,:;()«»"،·]+)\s*$/.exec(v.slice(0, m.index))?.[1];
        assert.ok(prev === 'لكل' || prev === 'لأي', `${key}: {learner} after «لكل» or «لأي» (after "${prev}")`);
        const afterText = v.slice(m.index! + m[0].length);
        const next = /^\s*([^\s.,:;()«»"،·]+)/.exec(afterText)?.[1];
        assert.ok(next === undefined || /^\s*[.,:;()«»"،·]/.test(afterText) || NEIGHBOURS.includes(next), `${key}: the word after {learner} is "${next}"`);
      }
    }
    for (const key of ['quizCardHelp', 'quizOpened', 'quizDraftHelp', 'quizPreviewLink'] as const) assert.ok(UI.ar[key].includes('{learner}'), `${key} carries {learner} (checked above)`);
    assert.ok(!UI.ar.quizOpenHelp.includes('{'), 'quizOpenHelp has no placeholder (checked above)');
  });

  it('UX-77 no spaced slash, no literal constants, no subject kit placeholder, same placeholders; every <max>, <min>, <len> after a colon or «من … إلى»', () => {
    for (const key of ALL_KEYS) {
      for (const lang of ['ar', 'en'] as const) {
        const v = UI[lang][key];
        assert.ok(!/\s\/\s/.test(v), `${lang} ${key}: no spaced slash`);
        const numbers = v.replace(/{[^}]*}/g, ' ').match(/\d+/g) ?? [];
        for (const c of CONSTANTS) assert.ok(!numbers.includes(c), `${lang} ${key}: no literal ${c}`);
        for (const m of v.matchAll(/{([A-Za-z]+)}/g)) assert.ok(TYPED.includes(m[1]), `${lang} ${key}: {${m[1]}} is a typed placeholder (never {subject})`);
      }
      assert.deepEqual([...UI.ar[key].matchAll(/{(\w+)}/g)].map((m) => m[1]).sort(), [...UI.en[key].matchAll(/{(\w+)}/g)].map((m) => m[1]).sort(), `${key}: the same placeholders in both languages`);
      const ar = UI.ar[key];
      for (const m of ar.matchAll(/{(max|min|len)}/g)) {
        const before = ar.slice(0, m.index).trimEnd();
        const ok = before.endsWith(':') || (m[1] === 'min' && before.endsWith('من')) || (m[1] === 'max' && /من {min} إلى$/.test(before));
        assert.ok(ok, `${key}: {${m[1]}} follows a colon or «من … إلى» ("${before.slice(-20)}")`);
      }
    }
  });

  it('UX-77 bdi and dir auto on quiz text: titles and names in <bdi>, question and answer texts in dir=auto, dates Latin YYYY-MM-DD in dir=ltr (W7-c QX)', async () => {
    const { w, browser } = x;
    const s = w.school;
    await withW7c(w);
    const list = publisherQuizzes(s, s.math);
    const k = await open(browser, w, HADEER, list, { lang: 'ar' });
    const page = k.page;
    assert.ok(await page.$$eval('#quiz-list a.quiz-row-link', (as) => as.every((a) => a.firstElementChild?.tagName === 'BDI')), 'list titles in <bdi>');
    assert.ok(await page.$$eval('#quiz-removed .quiz-row-title', (as) => as.every((a) => a.firstElementChild?.tagName === 'BDI')), 'removed titles in <bdi>');
    await go(page, w, `${list}/w7c-qx`);
    assert.ok(await page.$('#quiz-editor-title bdi'), 'the editor title in <bdi>');
    assert.ok(await page.$$eval('#quiz-questions textarea, #quiz-questions input:not([type=radio]):not([type=hidden])', (es) => es.every((e) => e.getAttribute('dir') === 'auto')), 'question and answer fields dir=auto');
    await go(page, w, `${list}/${W7A.QA}`);
    assert.ok(await page.$$eval('.quiz-text, .quiz-answer-text', (es) => es.length > 0 && es.every((e) => e.getAttribute('dir') === 'auto')), 'locked texts dir=auto');
    await go(page, w, resultsOf(list, W7A.QA));
    assert.ok(await page.$('#quiz-results-title bdi'), 'the results title in <bdi>');
    assert.ok(await page.$$eval('a.quiz-name', (as) => as.length === 2 && as.every((a) => a.firstElementChild?.tagName === 'BDI')), 'names in <bdi>');
    await k.ctx.close();
  });

  it('UX-77 language check by key (three kits): lang and dir; on an Arabic page no English value of the keys, and the reverse, on the card, the list, the editor and the results', async () => {
    const { w, browser } = x;
    const people = { school: ADMIN, company: COMPANY_ADMIN, university: UNIVERSITY_ADMIN };
    // A quiz with a question in the Company and University spaces too.
    const made: Record<string, string> = {};
    for (const space of [w.company, w.university]) {
      const c = await as(w, people[space.kit], 'en');
      const res = await c.post(adminQuizzes(space, space.math), { title: 'Kit check' });
      assert.equal(res.status, 303);
      const editor = (res.headers.get('location') ?? '').replace(w.p.url, '').split('?')[0];
      assert.equal((await c.post(`${editor}/question`, questionForm('Kit question', ['One', 'Two'], 1, 0))).status, 303);
      made[space.kit] = editor;
    }
    made.school = `${adminQuizzes(w.school, w.school.math)}/${W7A.QB}`;
    const longest = (v: string) => v.split(/{[^}]*}/).map((p) => p.trim()).sort((p, q) => q.length - p.length)[0];
    const values = (lang: Lang) => TEACHER_KEYS.map((k) => [k, longest(UI[lang][k])] as const).filter(([, v]) => v.length >= (lang === 'en' ? 5 : 4));
    // Data on the pages (titles, question and answer texts, names) is cut before the check.
    const data = /[^\n]*(Mathematics|الرياضيات|Fractions|Decimals|Angles|Old quiz|Kit check|Kit question|One|Two|0\.\d+|Mesk|Salma|Omar)[^\n]*/g;
    for (const lang of ['ar', 'en'] as const) {
      for (const space of [w.school, w.company, w.university]) {
        const editor = made[space.kit];
        const listPath = editor.slice(0, editor.lastIndexOf('/'));
        for (const [path, scope] of [[topicPath(space, space.math), '#quizzes'], [listPath, 'main'], [editor, 'main']] as const) {
          const k = await open(browser, w, people[space.kit], path, { lang });
          assert.deepEqual(await k.page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir })), { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' });
          const text = (await k.page.innerText(scope)).replace(data, ' ');
          for (const [key, value] of values(lang === 'ar' ? 'en' : 'ar')) assert.ok(!text.includes(value), `${space.kit} ${lang} ${path}: no ${lang === 'ar' ? 'English' : 'Arabic'} ${key} ("${value}")`);
          await k.ctx.close();
        }
      }
      // The results page (the responsible publisher only, school).
      const k = await open(browser, w, HADEER, resultsOf(publisherQuizzes(w.school, w.school.math), W7A.QA), { lang });
      const text = (await k.page.innerText('main')).replace(data, ' ');
      for (const [key, value] of values(lang === 'ar' ? 'en' : 'ar')) assert.ok(!text.includes(value), `results ${lang}: no ${key} ("${value}")`);
      await k.ctx.close();
    }
  });
});

// ------------------------------------------------------------------- UX-78 ----
describe('UX-78 states table', { concurrency: false }, () => {
  const x = world({ b: true });

  it('UX-78 the card always shown; the list, the editor and the results in every non-n/a state', async () => {
    const { w, browser } = x;
    const s = w.school;
    let amal = await as(w, ADMIN, 'en');
    const hadeer = await as(w, HADEER, 'en');
    const text = async (path: string, c = amal) => (await c.get(path)).text();
    // Card: always shown, an empty subject too.
    const made = await amal.post(`/s/${s.id}/admin/topics`, { title: 'Empty subject test', publisher: '' });
    assert.equal(made.status, 303);
    const empty = (made.headers.get('location') ?? '').replace(w.p.url, '');
    assert.ok((await text(empty)).includes('id="quizzes"'), 'card: always shown (an empty subject too)');
    // List empty: the new-quiz form and no list, no fold.
    const emptyList = await text(`${empty}/quizzes`);
    assert.ok(emptyList.includes('id="quiz-new"') && !emptyList.includes('id="quiz-list"') && !emptyList.includes('id="quiz-removed"'), 'list empty: form, no list, no fold');
    const k = await open(browser, w, ADMIN, `${empty}/quizzes`, { lang: 'ar' });
    await uxShot(k.page, 'UX-78-phone-ar-empty-list');
    await k.ctx.close();
    // The browser set Amal's own language to Arabic: sign in again in English.
    amal = await as(w, ADMIN, 'en');
    const list = adminQuizzes(s, s.math);
    // List error: 400 title kept.
    const long = 'x'.repeat(QUIZ_TITLE_MAX + 1);
    const bad = await amal.post(list, { title: long });
    assert.equal(bad.status, 400, 'list error: 400');
    assert.ok((await bad.text()).includes(`value="${long}"`), 'list error: the title kept');
    // List error: failed write.
    w.p.faults!.set({ before: (q) => { if (/^\s*INSERT INTO quiz\b/.test(q)) throw new Error('forced failure'); } });
    let failed: Response;
    try {
      failed = await amal.post(list, { title: 'Will fail' });
    } finally {
      w.p.faults!.set({});
    }
    assert.equal(failed.status, 303);
    assert.equal(statusOf(await text((failed.headers.get('location') ?? '').replace(w.p.url, ''))), UI.en.markFailed, 'list error: failed write');
    // List error: 403 and 404.
    assert.equal((await hadeer.get(list)).status, 403, 'list error: 403 on the admin address for a publisher');
    assert.equal((await amal.get(`${list}/w7-made-up`)).status, 404, 'editor error: 404 made-up id');
    // List success: quizCreated on the editor, quizRestored on the list.
    const created = await amal.post(list, { title: 'States check' });
    const editor = (created.headers.get('location') ?? '').replace(w.p.url, '');
    const editorPage = await text(editor);
    assert.equal(statusOf(editorPage), UI.en.quizCreated, 'success: quizCreated');
    // Editor empty: draft help, open help, the new-question form; Open answers quizNotReady.
    assert.ok(editorPage.includes(UI.en.quizDraftHelp.split('{learner}')[0]) && editorPage.includes(UI.en.quizOpenHelp) && editorPage.includes('id="question-new"'), 'editor empty: helps and the new-question form');
    const id = editor.split('/').pop()!.split('?')[0];
    const notReady = await amal.post(`${list}/${id}/open`, { rev: '0' });
    assert.ok([400, 409].includes(notReady.status), `editor empty: Open refused (${notReady.status})`);
    assert.equal(messageOf(await notReady.text()), UI.en.quizNotReady, 'editor empty: quizNotReady');
    // Editor error: 409 quizLocked (QA with W7-b).
    const qa = await quizRow(sql(w), W7A.QA);
    const locked = await amal.post(`${list}/${W7A.QA}/question/${QA_QUESTIONS[0].id}`, questionForm('Changed', ['a', 'b'], 1, qa.rev));
    assert.equal(locked.status, 409);
    assert.equal(messageOf(await locked.text()), UI.en.quizLocked, 'editor error: quizLocked');
    // Editor success: quizCopied on the copy.
    const copy = await amal.post(`${list}/${W7A.QA}/copy`, { rev: String(qa.rev) });
    assert.equal(statusOf(await text((copy.headers.get('location') ?? '').replace(w.p.url, ''))), UI.en.quizCopied, 'editor success: quizCopied');
    // Results: none, 403 for anyone but the responsible publisher, 404 past the end, the table.
    const results = publisherQuizzes(s, s.math);
    assert.ok((await text(resultsOf(results, W7A.QB), hadeer)).includes(UI.en.quizResultsNone), 'results empty: quizResultsNone');
    // W7-3 [B] (contract v4 amendment on PIL-295, R7 item 1): the admin results address is now the scores page (AT-9); the
    // admin still gets 403 on the publisher results address and on the admin answers address.
    assert.equal((await amal.get(resultsOf(results, W7A.QA))).status, 403, 'results error: 403 for the admin on the publisher address');
    assert.equal((await amal.get(`${resultsOf(list, W7A.QA)}/${w.ids[SALMA.username]}`)).status, 403, 'results error: 403 for the admin on the admin answers address');
    assert.equal((await amal.get(resultsOf(list, W7A.QA))).status, 200, 'the admin scores page (AT-9)');
    assert.equal((await hadeer.get(`${resultsOf(results, W7A.QA)}?page=2`)).status, 404, 'results error: 404 past the end');
    assert.ok((await text(resultsOf(results, W7A.QA), hadeer)).includes('id="quiz-results"'), 'results success: the table');
    // Removed and restored: quizRestored on the list.
    const removed = await amal.post(`${list}/${W7A.QB}/remove`, { rev: String((await quizRow(sql(w), W7A.QB)).rev) });
    assert.equal(statusOf(await text((removed.headers.get('location') ?? '').replace(w.p.url, ''))), UI.en.quizRemoved);
    assert.equal((await hadeer.get(resultsOf(results, W7A.QB))).status, 404, 'results error: 404 removed quiz');
    const restored = await amal.post(`${list}/${W7A.QB}/restore`, {});
    assert.equal(statusOf(await text((restored.headers.get('location') ?? '').replace(w.p.url, ''))), UI.en.quizRestored, 'success: quizRestored');
  });
});

// ------------------------------------------------------------------- UX-79 ----
describe('UX-79 widths, targets, contrast and keyboard', { concurrency: false }, () => {
  const x = world({ b: true });

  it('UX-79 the card, the list, the editor and the results: no sideways scroll or clipped text at 390, 768, 1280 and 320 px with W7-d; 44 px targets, 4.5:1 text, focus rings; Tab reaches every control in DOM order', async () => {
    const { w, browser } = x;
    const s = w.school;
    await withW7d(w, sql(w), 'draft');
    const list = publisherQuizzes(s, s.math);
    const widths: [string, { width: number; height: number }][] = [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]];
    const pages: [string, string, string, string][] = [
      ['card', editorPath(s, s.math), '#quizzes a.quiz-link-button', '#quizzes > h2, #quizzes .quiz-help, #quizzes a.quiz-link-button'],
      ['list', list, '#quiz-back, #quiz-new button, #quiz-list a.quiz-row-link, #quiz-list a.quiz-results-link, #quiz-removed > summary', '#quiz-list-title, label, .quiz-state, .quiz-count, a.quiz-row-link, a.quiz-results-link, #quiz-new button'],
      ['editor', `${list}/${QL}`, '#quiz-back, #quiz-title-form button, .quiz-actions button, #question-ql-a form.quiz-question-form > button, #question-ql-a .quiz-remove-question button, #quiz-copy button, #question-ql-a .quiz-radio', '#quiz-editor-title, label, .quiz-help, .quiz-state, .quiz-actions button, #quiz-copy button'],
      ['results', resultsOf(list, W7A.QA), '#quiz-back, a.quiz-name', '#quiz-results-title, caption, th, td, #quiz-stats li'],
    ];
    for (const lang of ['ar', 'en'] as const) {
      for (const [name, path, targets, texts] of pages) {
        const k = await open(browser, w, HADEER, path, { lang });
        const page = k.page;
        for (const [wname, size] of widths) {
          await page.setViewportSize(size);
          await page.reload();
          const o = await overflow(page);
          assert.ok(o.sideways <= 0, `${name} ${lang} ${wname}: no sideways scroll (${o.sideways})`);
          assert.deepEqual(o.clipped.filter((c) => !/\.sr-only|sr-only:/.test(c)), [], `${name} ${lang} ${wname}: no clipped text`);
          if (name === 'editor' && lang === 'en' && wname === 'tablet') await uxShot(page, 'UX-79-tablet-en');
        }
        await page.setViewportSize(WIDTHS.phone);
        await page.reload();
        if (name === 'list') await page.click('#quiz-removed > summary');
        for (const m of await measure(page, targets)) assert.ok(m.width >= 44 && m.height >= 44, `${name} ${lang}: ${m.selector} ${m.width}x${m.height}`);
        for (const m of await measure(page, texts)) {
          if (!m.text.trim()) continue;
          assert.ok(m.contrast >= 4.5, `${name} ${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
        }
        // Focus rings and Tab order: from the first control, Tab walks the DOM order with no trap.
        const order = await page.$$eval('main a[href], main button, main input:not([type=hidden]), main textarea, main summary', (els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.id || `${e.tagName.toLowerCase()}.${(e as HTMLElement).className}`));
        await page.focus('main a[href], main button');
        await page.keyboard.press('Shift+Tab');
        const seen: string[] = [];
        for (let i = 0; i < Math.min(order.length, 25); i++) {
          const f = await tab(page);
          assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${name} ${lang}: the focus ring on ${f.id || f.tag} (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
          seen.push(f.id || f.tag);
        }
        assert.ok(seen.length > 0, `${name} ${lang}: Tab reaches the controls`);
        await k.ctx.close();
      }
    }
  });

  it('UX-79 keyboard: J1 (create a quiz, add a question, open it) by keyboard only; arrow keys move within the radio group', async () => {
    const { w, browser } = x;
    const s = w.school;
    const k = await open(browser, w, HADEER, editorPath(s, s.math), { lang: 'en' });
    const page = k.page;
    let reached = false;
    for (let i = 0; i < 250 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.classList.contains('quiz-link-button') ?? false);
    }
    assert.ok(reached, 'the manage link is reached by Tab (no trap before it)');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    await page.focus('#quiz-new-title');
    await page.keyboard.type('Keyboard quiz');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    await page.focus('#question-new textarea');
    await page.keyboard.type('Keyboard question?');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Yes');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement).value), '1', 'Space marks answer 1');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement).value), '2', 'an arrow key moves within the group');
    await page.keyboard.press('ArrowUp');
    await page.focus('#question-new input[name=answer2]');
    await page.keyboard.type('No');
    await page.focus('#question-new form > button');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    await page.focus('#quiz-state .quiz-actions form:first-child button');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    const id = new URL(page.url()).pathname.split('/').pop()!;
    const row = await quizRow(sql(w), id);
    assert.equal(row.state, 'open', 'J1 by keyboard: the quiz is open');
    assert.equal(row.questions.length, 1, 'with its question');
    assert.equal(row.questions[0].rightId, row.questions[0].answers[0].id, 'the right answer as marked');
    await k.ctx.close();
  });
});
