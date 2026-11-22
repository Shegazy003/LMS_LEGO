// LMS wave 7, W7-3: the UX floor of the guardian's quiz scores and the admin's
// scores page (ux-plan v3 addendum on PIL-285, rev 75ff872d, with the v4
// amendment on PIL-295, rev be9da2d6): UX-83 (place, order, read-only), UX-84
// (wording, the single source of the new strings) and UX-85 (states, widths,
// sizes and keyboard; [B] the admin's pages), journeys J6 and J7. Each test is
// its own CI step (`UX-<n> …`, job wave-7, selected with --test-name-pattern),
// on a fresh wave 7 world with the clock pinned and lesson activity on, in
// Chromium (Playwright). Screenshots go to evidence/ux/ as the ux-plan names
// them, Arabic first. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import { UX49_DENY } from '../wave4/world.ts';
import { writeAttempt } from './attempts.ts';
import { QZ_TITLE, SAMI7, attrOf, domOf, nodesOf, send, withW7g, type W7g } from './guardian.ts';
import {
  ADMIN, AT, HADEER, LAILA6, MONA, OMAR, QA_QUESTIONS, RANA5, SALMA, TITLES, UX_EVIDENCE, W7A, WIDTHS, activity, adminQuizzes, as, browserAs, closeWave6, editorPath, fixed, go,
  insertQuiz, linkedPath, quizRowsOf, resultsOf, topicPath, uxShot, wave7World, withKitGuardians, withW6f, words, type Wave1World, type Width,
} from './world.ts';

type Lang = 'ar' | 'en';
const GUARDIAN_KEYS = ['guardianQuizTitle', 'guardianQuizNote', 'guardianQuizLine', 'guardianQuizMore', 'guardianQuizCapped'] as const satisfies readonly UiKey[];
const NEW_KEYS = [...GUARDIAN_KEYS, 'quizAdminScoresNote'] as const satisfies readonly UiKey[];
/** The judging words of the quiz pages that must never reach the guardian's block (the verdict keys). */
const VERDICT_KEYS = ['quizRight', 'quizWrong', 'quizNoAnswer', 'quizRightMark', 'quizChosen'] as const satisfies readonly UiKey[];

async function open(browser: Browser, w: Wave1World, who: { username: string; password: string }, path: string, opts: { width?: Width; lang?: Lang } = {}) {
  const tabbed = await browserAs(browser, w, who, { width: opts.width ?? 'phone', lang: opts.lang ?? 'ar' });
  await go(tabbed.page, w, path);
  return tabbed;
}

const inDomOrder = (page: Page, selectors: string[]) => page.evaluate((sels) => {
  const els = sels.map((s) => document.querySelector(s));
  if (els.some((e) => !e)) return `missing: ${sels.filter((_, i) => !els[i]).join(', ')}`;
  for (let i = 1; i < els.length; i++) {
    if (!(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING)) return `${sels[i - 1]} is not before ${sels[i]}`;
  }
  return 'ok';
}, selectors);

/** The fixed text of a value between its placeholders (parts of at least 4 characters). */
const fixedParts = (v: string) => v.split(/{[^}]*}/).map((x) => x.replace(/^[\s·:().]+|[\s·:().]+$/g, '')).filter((x) => x.length >= 4);

/** Every element in a region that takes the keyboard's focus or acts. */
const controlsIn = (page: Page, root: string) => page.$$eval(['a', 'button', 'input', 'select', 'textarea', 'form', '[tabindex]', '[onclick]'].map((s) => `${root} ${s}`).join(', '), (els) => els.map((e) => e.outerHTML.slice(0, 80)));

/** `n` more quizzes of Mesk School's Mathematics, each sent by the learner (1 of 1), newer than W7-g's sendings. */
async function moreQuizzesFor(w: Wave1World, learner: string, n: number, prefix: string): Promise<string[]> {
  const s = w.school;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `${prefix}-${String(i + 1).padStart(2, '0')}`;
    const questions = [fixed(`${id}-one`, 'Practice question.', ['Yes', 'No'], 1)];
    await insertQuiz((q) => w.p.sql(q), { id, space: s.id, subject: s.math, title: `Practice quiz ${String(i + 1).padStart(2, '0')}`, questions, state: 'open', created: AT.noon - 1_500_000 + i });
    await writeAttempt((q) => w.p.sql(q), { id: `${id}-${learner}`, space: s.id, quiz: id, learner, questions, posted: { [`${id}-one`]: `${id}-one-a` }, sentAt: AT.noon - 500_000 + i * 1000 });
    ids.push(id);
  }
  return ids;
}

/** QX8 of AT-7.8: 120 characters with <script>, <b>, &amp;, &, a quote, another learner's name and a question text of QA. */
const QX8_TITLE = [...`<script>alert(1)</script> <b>bold</b> &amp; & "quoted" Omar C ${QA_QUESTIONS[0].text} `.padEnd(120, 'x')].slice(0, 120).join('');
async function withHostile(w: Wave1World): Promise<void> {
  await insertQuiz((q) => w.p.sql(q), { id: 'ux-qx8', space: w.school.id, subject: w.school.math, title: QX8_TITLE, questions: [fixed('ux-qx8-one', 'Pick one.', ['Yes', 'No'], 1)], state: 'open', created: AT.noon - 2_000_000 });
  await send(await as(w, SALMA, 'en'), w.school, 'ux-qx8', { 'ux-qx8-one': 'ux-qx8-one-a' });
}

function world(opts: { kits?: boolean } = {}) {
  const box: { w?: Wave1World; g?: W7g; browser?: Browser } = {};
  before(async () => {
    const made = await wave7World({ activity: true });
    box.w = made.w;
    if (opts.kits) {
      await withW6f(made.w, made.a);
      await withKitGuardians(made.w);
    }
    box.g = await withW7g(made.w);
    if (opts.kits) {
      await insertQuiz((q) => made.w.p.sql(q), { id: 'ux-qu', space: made.w.university.id, subject: made.w.university.math, title: 'Epsilon quiz W7', questions: [fixed('ux-qu-one', 'Pick one.', ['Yes', 'No'], 1)], state: 'open', created: AT.noon - 3_000_000 });
      await send(await as(made.w, SALMA, 'en'), made.w.university, 'ux-qu', { 'ux-qu-one': 'ux-qu-one-a' });
    }
    box.browser = await chromium.launch();
  });
  after(async () => {
    await box.browser?.close();
    await closeWave6(box.w);
  });
  return box as { w: Wave1World; g: W7g; browser: Browser };
}

// ------------------------------------------------------------------- UX-83 ----
describe('UX-83 guardian quiz block: place, order, read-only', { concurrency: false }, () => {
  const x = world();

  it('UX-83 guardian quiz block place, order and read-only: right after #results and last; h2 with the name in <bdi>, the note in the secondary style, at most 5 items, a closed native fold of up to 20, the capped line last in the fold; each item a plain-text <bdi> title then the line; no control but the fold summary', async () => {
    const { w, g, browser } = x;
    const s = w.school;
    const salmaPage = linkedPath(s, g.salma);
    for (const [lang, width, shot] of [['ar', 'phone', 'UX-83-phone-ar'], ['ar', 'tablet', 'UX-83-tablet-ar'], ['en', 'desktop', 'UX-83-desktop-en']] as const) {
      const k = await open(browser, w, MONA, salmaPage, { lang, width });
      const page = k.page;
      const t = words('school', lang);
      assert.equal(await inDomOrder(page, ['#results', '#quiz-guardian']), 'ok', `${lang} ${width}: after #results`);
      assert.equal(await page.evaluate(() => {
        const b = document.querySelector('#quiz-guardian')!;
        return b.previousElementSibling?.id === 'results' && b === b.parentElement!.lastElementChild && b.parentElement!.tagName === 'MAIN';
      }), true, `${lang}: right after #results and the last block of main`);
      assert.deepEqual(await page.$$eval('#quiz-guardian > *', (els) => els.map((e) => `${e.tagName.toLowerCase()}${e.className ? `.${e.className.split(' ').join('.')}` : ''}`)), ['h2', 'p.muted', 'ul.quiz-guardian-list'], `${lang}: heading, note, list (one item: no fold)`);
      assert.equal((await page.textContent('#quiz-guardian > h2'))?.replace(/\s+/g, ' ').trim(), t('guardianQuizTitle', { name: SALMA.display_name }), `${lang}: guardianQuizTitle`);
      assert.equal((await page.textContent('#quiz-guardian > h2 > bdi'))?.trim(), SALMA.display_name, `${lang}: the name in <bdi>`);
      assert.equal((await page.textContent('#quiz-guardian > p.muted'))?.trim(), t('guardianQuizNote'), `${lang}: guardianQuizNote`);
      const tone = await page.evaluate(() => {
        const c = (sel: string) => getComputedStyle(document.querySelector(sel)!).color;
        return { note: c('#quiz-guardian > p.muted'), line: c('#quiz-guardian .quiz-guardian-line'), heading: c('#quiz-guardian > h2'), title: c('#quiz-guardian li > bdi') };
      });
      assert.ok(tone.note !== tone.heading && tone.line !== tone.title, `${lang}: the note and the line in the secondary text colour (${tone.note}, ${tone.line}; heading ${tone.heading})`);
      for (const m of await measure(page, '#quiz-guardian > p.muted, #quiz-guardian .quiz-guardian-line, #quiz-guardian h2, #quiz-guardian li > bdi')) {
        if (m.text.trim()) assert.ok(m.contrast >= 4.5, `${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
      }
      const items = await page.$$eval('#quiz-guardian li', (lis) => lis.map((li) => ({ parts: [...li.children].map((c) => `${c.tagName.toLowerCase()}${c.className ? `.${c.className.split(' ').join('.')}` : ''}`), title: li.querySelector('bdi')?.textContent, line: li.querySelector('.quiz-guardian-line')?.textContent?.replace(/\s+/g, ' ').trim() })));
      assert.deepEqual(items, [{ parts: ['bdi', 'span.muted.quiz-guardian-line'], title: TITLES.QA, line: t('guardianQuizLine', { subjectTitle: 'Mathematics', score: '1', total: '3' }) }], `${lang}: one item, the plain-text title in <bdi>, then the line; no link, no date`);
      assert.deepEqual(await controlsIn(page, '#quiz-guardian'), [], `${lang}: no link, button, field or form in the block`);
      await uxShot(page, shot);
      await k.ctx.close();
    }

    // With wave 6's to-do block (the Lead's pin: #guardian-todo is on W7-2-main): to-do block, results, quiz block.
    let k = await open(browser, w, MONA, salmaPage, { lang: 'ar' });
    assert.equal(await inDomOrder(k.page, ['#linked', '#guardian-todo', '#results', '#quiz-guardian']), 'ok', 'the card, the to-do block, the results, the quiz block');
    await uxShot(k.page, 'UX-83-phone-ar-with-todo');
    await k.ctx.close();

    // Activity off: the activity-off line as today, and the block still at the end.
    await activity(w, false);
    k = await open(browser, w, MONA, salmaPage, { lang: 'ar' });
    assert.equal(await inDomOrder(k.page, ['#activity-off', '#results', '#quiz-guardian']), 'ok', 'activity off: the line, the results, the block');
    assert.equal(await k.page.evaluate(() => document.querySelector('#quiz-guardian') === document.querySelector('main')!.lastElementChild), true, 'activity off: the block is last');
    await uxShot(k.page, 'UX-83-phone-ar-activity-off');
    await k.ctx.close();
    await activity(w, true);

    // Many (25 + 4 sent): 5 shown, a closed fold of 20 that opens, the capped line last in the fold.
    await moreQuizzesFor(w, g.salma, 28, 'ux83-many');
    k = await open(browser, w, MONA, salmaPage, { lang: 'ar' });
    const t = words('school', 'ar');
    assert.deepEqual(await k.page.evaluate(() => {
      const b = document.querySelector('#quiz-guardian')!;
      const d = b.querySelector(':scope > details') as HTMLDetailsElement;
      return { shown: b.querySelectorAll(':scope > ul > li').length, folded: d.querySelectorAll(':scope > ul > li').length, open: d.open, last: d.lastElementChild?.className, summary: d.querySelector(':scope > summary')?.textContent?.trim(), capped: d.querySelector(':scope > p.quiz-guardian-capped')?.textContent?.trim() };
    }), { shown: 5, folded: 20, open: false, last: 'quiz-guardian-capped', summary: t('guardianQuizMore', { n: '20' }), capped: t('guardianQuizCapped', { n: '4' }) }, '5 shown, a closed fold of 20, capped 4 at the end of the fold');
    await k.page.click('#quiz-guardian details > summary');
    assert.equal(await k.page.$eval('#quiz-guardian details', (d) => (d as HTMLDetailsElement).open), true, 'the fold opens');
    assert.deepEqual(await controlsIn(k.page, '#quiz-guardian'), [], 'still no control but the summary');
    await uxShot(k.page, 'UX-83-phone-ar-many');
    await k.ctx.close();
    await w.p.sql("DELETE FROM quiz_attempt WHERE quiz_id LIKE 'ux83-many-%'");
    await w.p.sql("DELETE FROM quiz WHERE id LIKE 'ux83-many-%'");

    // AT-7.8's 120-character hostile title: escaped, one text node, no overflow.
    await withHostile(w);
    k = await open(browser, w, MONA, salmaPage, { lang: 'ar' });
    assert.ok(await k.page.$$eval('#quiz-guardian li > bdi', (bs, raw) => bs.some((b) => b.childNodes.length === 1 && b.textContent === raw), QX8_TITLE), 'the raw title as the <bdi> text');
    assert.equal(await k.page.$$eval('#quiz-guardian script, #quiz-guardian b', (e) => e.length), 0, 'no script or b element');
    const o = await overflow(k.page);
    assert.ok(o.sideways <= 0, `no sideways scroll (${o.sideways})`);
    await uxShot(k.page, 'UX-83-phone-ar-hostile');
    await k.ctx.close();
    await w.p.sql("DELETE FROM quiz_attempt WHERE quiz_id = 'ux-qx8'");
    await w.p.sql("DELETE FROM quiz WHERE id = 'ux-qx8'");
  });

  it('UX-83 guardian quiz block absent with no taken quiz: no block and no empty message; the page is today\'s', async () => {
    const { w, g, browser } = x;
    const s = w.school;
    const shown = (await w.p.sql(`SELECT id FROM quiz WHERE space_id = '${s.id}' AND removed_at IS NULL`)).map((r) => String(r.id));
    await w.p.sql(`UPDATE quiz SET removed_at = ${AT.noon - 1} WHERE space_id = '${s.id}' AND removed_at IS NULL`);
    try {
      for (const lang of ['ar', 'en'] as const) {
        const k = await open(browser, w, MONA, linkedPath(s, g.salma), { lang });
        assert.equal(await k.page.$('#quiz-guardian'), null, `${lang}: no block`);
        assert.ok(await k.page.$('#results'), `${lang}: the results as today`);
        const text = (await k.page.textContent('main')) ?? '';
        for (const key of GUARDIAN_KEYS) {
          for (const part of fixedParts(UI[lang][key])) assert.ok(!text.includes(part), `${lang}: no ${key} ("${part}"), no empty message`);
        }
        await k.ctx.close();
      }
    } finally {
      await w.p.sql(`UPDATE quiz SET removed_at = NULL WHERE id IN (${shown.map((id) => `'${id}'`).join(', ')})`);
    }
    // Nabil Test's learner (Karim Test) took QG only; Sami Test's Omar C took QA: each sees their own learner's block.
    const k = await open(browser, w, MONA, linkedPath(s, g.salma), { lang: 'ar' });
    assert.ok(await k.page.$('#quiz-guardian'), 'quizzes listed again: the block is back');
    await k.ctx.close();
  });

  it('UX-83 no judging cue: the lines of a 1-of-3 and a 3-of-3 item have the same computed colour, weight, size and background; no verdict word, no image, no rank', async () => {
    const { w, g, browser } = x;
    const s = w.school;
    for (const lang of ['ar', 'en'] as const) {
      const looks: Record<string, unknown>[] = [];
      for (const learner of [g.salma, g.omar]) {
        const k = await open(browser, w, SAMI7, linkedPath(s, learner), { lang });
        looks.push(await k.page.evaluate(() => {
          const look = (sel: string) => {
            const st = getComputedStyle(document.querySelector(sel)!);
            return [st.color, st.fontWeight, st.fontSize, st.backgroundColor, st.textDecorationLine, st.borderColor].join(' | ');
          };
          return { line: look('#quiz-guardian .quiz-guardian-line'), title: look('#quiz-guardian li > bdi'), item: look('#quiz-guardian li'), images: document.querySelectorAll('#quiz-guardian img, #quiz-guardian svg, #quiz-guardian [style]').length };
        }));
        const text = (await k.page.textContent('#quiz-guardian')) ?? '';
        for (const key of VERDICT_KEYS) assert.ok(!text.includes(UI[lang][key]), `${lang}: no verdict word (${key})`);
        await k.ctx.close();
      }
      assert.deepEqual(looks[1], looks[0], `${lang}: Omar C's 3 of 3 looks as Salma's 1 of 3`);
      assert.equal(looks[0].images, 0, `${lang}: no image, icon or inline style`);
    }
    // The line names the score itself (no pass or fail word, no rank): exactly guardianQuizLine.
    const omar = await open(browser, w, SAMI7, linkedPath(s, g.omar), { lang: 'en' });
    assert.equal((await omar.page.textContent('#quiz-guardian .quiz-guardian-line'))?.replace(/\s+/g, ' ').trim(), words('school', 'en')('guardianQuizLine', { subjectTitle: 'Mathematics', score: '3', total: '3' }));
    await omar.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-84 ----
const DENY = [...new Set([...UX49_DENY, 'ذلك', 'تلك', 'هؤلاء'])];
/** W7-3 AMBER (as in UX-77): the frozen ux-plan gives two values verbatim that a check would refuse on its own words, so each
 * check allows exactly that one word in that one key: quizAdminScoresNote «… في هذه الصفحة.» (v4 U4, the demonstrative) and
 * guardianQuizNote «… المعروضة أعلاه.» (v3 table: «أعلاه», "above", is an adverb whose ending only looks like a pronoun). */
const ALLOW: Record<string, string> = { quizAdminScoresNote: 'هذه', guardianQuizNote: 'أعلاه' };
const noMarks = (v: string) => v.replace(/[ً-ْ]/g, '');
const tokensOf = (v: string) => noMarks(v).replace(/{[^}]*}/g, ' ').split(/[\s.,:;()«»"،·؟?]+/).filter(Boolean);
/** The kit words of the three seeded kits today (ux-plan U3): bare singulars. */
const ADMIN_WORDS = ['مدير', 'مسؤول التدريب', 'مسجّل'];

describe('UX-84 wording for the guardian quiz block and the admin scores page', { concurrency: false }, () => {
  const x = world({ kits: true });

  it('UX-84 guardian quiz keys: language, deny list, pronouns, neighbours in every kit', async () => {
    const { w, g, browser } = x;
    const TABLE: Record<(typeof NEW_KEYS)[number], { en: string; ar: string }> = {
      guardianQuizTitle: { en: 'Quiz scores: {name}', ar: 'درجات الاختبارات: {name}' },
      guardianQuizNote: { en: 'Short self-check quizzes, separate from the results above. Only the score is shown, not the questions or answers.', ar: 'اختبارات قصيرة للتحقق الذاتي، منفصلة عن النتائج المعروضة أعلاه. تظهر الدرجة فقط، دون الأسئلة والإجابات.' },
      guardianQuizLine: { en: '{subjectTitle} · score {score} of {total}', ar: '{subjectTitle} · الدرجة {score} من {total}' },
      guardianQuizMore: { en: 'More scores ({n})', ar: 'درجات أخرى ({n})' },
      guardianQuizCapped: { en: 'Other scores not shown: {n}.', ar: 'درجات أخرى غير معروضة: {n}.' },
      quizAdminScoresNote: { en: 'Scores only. Answers are not shown on this page.', ar: 'الدرجات فقط. لا تظهر الإجابات في هذه الصفحة.' },
    };
    for (const key of NEW_KEYS) {
      assert.deepEqual({ en: UI.en[key], ar: UI.ar[key] }, TABLE[key], `${key}: the ux-plan's values`);
      const tokens = tokensOf(UI.ar[key]);
      for (const bad of DENY) assert.ok(!tokens.includes(noMarks(bad)) || ALLOW[key] === bad, `${key}: no "${bad}"`);
      for (const word of tokens) if (/[؀-ۿ]/.test(word) && word.length >= 3 && ALLOW[key] !== word) assert.ok(!/(ه|ها|هم|هن|ك|كم)$/.test(word), `${key}: "${word}" ends in an attached pronoun`);
      for (const lang of ['ar', 'en'] as const) assert.ok(!/\s\/\s/.test(UI[lang][key]), `${lang} ${key}: no spaced slash`);
      assert.ok(!/[؀-ۿ]/.test(UI.en[key]) && !/[A-Za-z]{2,}/.test(UI.ar[key].replace(/{[^}]*}/g, '')), `${key}: each language's value in its own script`);
      assert.deepEqual([...UI.ar[key].matchAll(/{[^}]+}/g)].map((m) => m[0]).sort(), [...UI.en[key].matchAll(/{[^}]+}/g)].map((m) => m[0]).sort(), `${key}: the same placeholders`);
      assert.ok(!/\d/.test(UI.ar[key] + UI.en[key]), `${key}: no literal constant`);
    }
    assert.ok(!/{/.test(UI.ar.quizAdminScoresNote + UI.en.quizAdminScoresNote), 'quizAdminScoresNote has no placeholder');
    // The kit words (U3): in every kit the Arabic admin and guardian values are bare (no «ال»), the admin value a singular of today's.
    for (const kit of ['school', 'company', 'university'] as const) {
      const ar = words(kit, 'ar');
      for (const word of ['admin', 'guardian'] as const) assert.ok(!ar(word).startsWith('ال'), `${kit}: the Arabic ${word} value "${ar(word)}" is bare`);
      assert.ok(ADMIN_WORDS.includes(ar('admin')), `${kit}: the Arabic admin value "${ar('admin')}" is one of today's singulars`);
      for (const lang of ['ar', 'en'] as const) {
        const tt = words(kit, lang);
        const low = (k: 'admin' | 'guardian' | 'learner') => tt(k).toLocaleLowerCase(lang);
        assert.ok(!UI[lang].quizAdminScoresNote.includes(low('admin')) && !UI[lang].quizAdminScoresNote.includes(low('learner')), `${kit} ${lang}: quizAdminScoresNote holds no kit word`);
        const help = tt('quizCardHelp', { learner: low('learner'), subjectTitle: 'Mathematics', admin: low('admin'), guardian: low('guardian') });
        // The neighbours on the kit's actual words: «لكل <admin>.» and «صفحة <guardian> عند» / "every <admin>." and "the <guardian>'s page".
        if (lang === 'ar') {
          assert.ok(help.includes(`لكل ${low('admin')}.`) && help.includes(`في صفحة ${low('guardian')} عند وجود ربط.`), `${kit} ar: «لكل ${low('admin')}.» and «صفحة ${low('guardian')} عند» (${help.slice(-120)})`);
        } else {
          assert.ok(help.includes(`to every ${low('admin')}.`) && help.includes(`the ${low('guardian')}'s page shows`), `${kit} en: "every ${low('admin')}." and "the ${low('guardian')}'s page" (${help.slice(-140)})`);
        }
      }
    }
    // On the page, Laila Test in the Company and University kits, Arabic first: lang and dir, the block's values, no other language's value.
    for (const [space, title] of [[w.company, QZ_TITLE], [w.university, 'Epsilon quiz W7']] as const) {
      for (const lang of ['ar', 'en'] as const) {
        const other = lang === 'ar' ? 'en' : 'ar';
        const tt = words(space.kit, lang);
        const k = await open(browser, w, LAILA6, linkedPath(space, g.salma), { lang });
        const page = k.page;
        assert.deepEqual(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), [lang, lang === 'ar' ? 'rtl' : 'ltr'], `${space.kit} ${lang}: lang and dir`);
        assert.equal((await page.textContent('#quiz-guardian > h2'))?.replace(/\s+/g, ' ').trim(), tt('guardianQuizTitle', { name: SALMA.display_name }), `${space.kit} ${lang}: the heading`);
        assert.equal((await page.textContent('#quiz-guardian li > bdi'))?.trim(), title, `${space.kit} ${lang}: the title`);
        assert.equal((await page.textContent('#quiz-guardian .quiz-guardian-line'))?.replace(/\s+/g, ' ').trim(), tt('guardianQuizLine', { subjectTitle: 'Mathematics', score: '1', total: '1' }), `${space.kit} ${lang}: the line`);
        const text = (await page.textContent('#quiz-guardian')) ?? '';
        for (const key of GUARDIAN_KEYS) for (const part of fixedParts(UI[other][key])) assert.ok(!text.includes(part), `${space.kit} ${lang}: no ${other} ${key} (${part})`);
        if (lang === 'ar') await uxShot(page, `UX-84-phone-ar-${space.kit}`);
        await k.ctx.close();
      }
    }
    // An item's line in view with the heading scrolled out: the line still names the score (25 items, the fold open).
    await moreQuizzesFor(w, g.salma, 24, 'ux84-many');
    const k = await open(browser, w, MONA, linkedPath(w.school, g.salma), { lang: 'ar' });
    await k.page.click('#quiz-guardian details > summary');
    await k.page.$eval('#quiz-guardian details li:last-child .quiz-guardian-line', (e) => e.scrollIntoView({ block: 'center' }));
    const seen = await k.page.evaluate(() => {
      const h = document.querySelector('#quiz-guardian > h2')!.getBoundingClientRect();
      const l = document.querySelector('#quiz-guardian details li:last-child .quiz-guardian-line')!;
      const r = l.getBoundingClientRect();
      return { headingOut: h.bottom <= 0, lineIn: r.top >= 0 && r.bottom <= innerHeight + 1, line: l.textContent?.replace(/\s+/g, ' ').trim() };
    });
    // The last drawn item is the oldest sending: Practice quiz 01 (1 of 1), sent before W7-g's QA.
    assert.deepEqual(seen, { headingOut: true, lineIn: true, line: words('school', 'ar')('guardianQuizLine', { subjectTitle: 'Mathematics', score: '1', total: '1' }) }, 'the heading out of view, the line in view, naming the score');
    await k.page.screenshot({ path: `${UX_EVIDENCE}UX-84-phone-ar-scrolled.png` });
    await k.ctx.close();
  });

  it('UX-84 quiz card help names who sees results: all three sentences by key on the editor and the subject admin page, three kits, Arabic and English', async () => {
    const { w, browser } = x;
    const editors: [kit: 'school' | 'company' | 'university', who: { username: string; password: string }, path: string, subjectId: string, spaceId: string][] = [
      ['school', HADEER, editorPath(w.school, w.school.math), w.school.math, w.school.id], ['school', ADMIN, topicPath(w.school, w.school.math), w.school.math, w.school.id],
      ['company', { username: 'hadeer.trainer', password: HADEER.password }, editorPath(w.company, w.company.math), w.company.math, w.company.id],
      ['university', { username: 'hadeer.lecturer', password: HADEER.password }, editorPath(w.university, w.university.math), w.university.math, w.university.id],
    ];
    const SENTENCES = {
      en: ['Full results are shown only to whoever publishes {subjectTitle}.', 'Scores, without the questions or answers, are also shown to every {admin}.', 'Where a link exists, the {guardian}\'s page shows the quiz title and the score only.'],
      ar: ['لا تظهر النتائج كاملة إلا لمن يتولّى نشر {subjectTitle}.', 'كما تظهر الدرجات، دون الأسئلة والإجابات، لكل {admin}.', 'ويظهر عنوان الاختبار والدرجة فقط في صفحة {guardian} عند وجود ربط.'],
    };
    for (const lang of ['ar', 'en'] as const) {
      const v = UI[lang].quizCardHelp;
      assert.ok(v.endsWith(SENTENCES[lang].join(' ')), `${lang}: quizCardHelp ends with the three sentences, in order (${v.slice(-200)})`);
      assert.ok(!v.includes('Results are shown only to whoever publishes') && !v.includes('لا تظهر النتائج إلا لمن'), `${lang}: v2's last sentence is gone`);
    }
    for (const [kit, who, path, subjectId, spaceId] of editors) {
      for (const lang of ['ar', 'en'] as const) {
        const k = await open(browser, w, who, path, { lang });
        const t = words(kit, lang);
        const low = (key: 'learner' | 'admin' | 'guardian') => t(key).toLocaleLowerCase(lang);
        const subject = String((await w.p.sql(`SELECT title FROM subject WHERE id = '${subjectId}' AND space_id = '${spaceId}'`))[0].title);
        const help = (await k.page.innerText('#quizzes .quiz-help')).replace(/\s+/g, ' ').trim();
        assert.equal(help, t('quizCardHelp', { learner: low('learner'), subjectTitle: subject, admin: low('admin'), guardian: low('guardian') }), `${kit} ${lang} ${path}: the help line`);
        for (const sentence of SENTENCES[lang]) {
          const filled = sentence.replace('{subjectTitle}', subject).replace('{admin}', low('admin')).replace('{guardian}', low('guardian'));
          assert.ok(help.includes(filled), `${kit} ${lang}: "${filled}"`);
        }
        await k.ctx.close();
      }
    }
  });
});

// ------------------------------------------------------------------- UX-85 ----
describe('UX-85 states, widths, sizes and keyboard (guardian page; [B] admin scores page)', { concurrency: false }, () => {
  const x = world();
  const goAny = async (page: Page, w: Wave1World, path: string) => (await page.goto(w.p.url + path))?.status();

  it('UX-85 guardian and admin results states: the linked page (success with fold and cap, empty, not linked, link ended, access ended); [B] the admin quiz list (each row with quizResultsLink (n)), the scores page (the note, then quizResultsNone; 403 for non-admins; 404 removed, other subject, past the end) and the answers address (always the 403 page)', async () => {
    const { w, g, browser } = x;
    const s = w.school;
    const salmaPage = linkedPath(s, g.salma);
    const tAr = words('school', 'ar');
    // Success: the block, the fold and, past 25, guardianQuizCapped (1 + 30 sent).
    const many = await moreQuizzesFor(w, g.salma, 30, 'ux85-many');
    let k = await open(browser, w, MONA, salmaPage, { lang: 'ar' });
    assert.equal((await k.page.textContent('#quiz-guardian details > p.quiz-guardian-capped'))?.trim(), tAr('guardianQuizCapped', { n: '6' }), 'success: the capped line');
    await k.ctx.close();
    // Empty: no listed quiz, no block, today's page.
    const shown = (await w.p.sql(`SELECT id FROM quiz WHERE space_id = '${s.id}' AND removed_at IS NULL`)).map((r) => String(r.id));
    await w.p.sql(`UPDATE quiz SET removed_at = ${AT.noon - 1} WHERE space_id = '${s.id}' AND removed_at IS NULL`);
    k = await open(browser, w, MONA, salmaPage, { lang: 'ar' });
    assert.ok(!(await k.page.$('#quiz-guardian')) && (await k.page.$('#results')), 'empty: no block, the results as today');
    assert.ok(!((await k.page.textContent('main')) ?? '').includes(UI.ar.guardianQuizNote), 'empty: no empty message');
    await uxShot(k.page, 'UX-85-phone-ar-empty');
    await k.ctx.close();
    await w.p.sql(`UPDATE quiz SET removed_at = NULL WHERE id IN (${shown.map((id) => `'${id}'`).join(', ')})`);
    await w.p.sql(`DELETE FROM quiz_attempt WHERE quiz_id IN (${many.map((id) => `'${id}'`).join(', ')})`);
    await w.p.sql(`DELETE FROM quiz WHERE id IN (${many.map((id) => `'${id}'`).join(', ')})`);
    // Error: not linked (Mona at Omar C's page), the link ended (Sami Test at Salma's), access ended (Sami Test's role): today's 403, no block.
    const mona = await as(w, MONA, 'ar');
    let refused = await mona.get(linkedPath(s, g.omar));
    assert.equal(refused.status, 403, 'not linked: 403');
    assert.ok(!(await refused.text()).includes('id="quiz-guardian"'), 'not linked: no block');
    const sami = await as(w, SAMI7, 'ar');
    assert.equal((await sami.get(salmaPage)).status, 200, 'linked: 200');
    await w.p.sql(`UPDATE guardian_link SET ended_at = ${AT.noon - 1} WHERE guardian_user_id = '${g.sami}' AND learner_user_id = '${g.salma}'`);
    refused = await sami.get(salmaPage);
    assert.equal(refused.status, 403, 'link ended: 403');
    assert.ok(!(await refused.text()).includes('id="quiz-guardian"'), 'link ended: no block');
    await w.p.sql(`UPDATE guardian_link SET ended_at = NULL WHERE guardian_user_id = '${g.sami}' AND learner_user_id = '${g.salma}'`);
    assert.equal((await sami.get(salmaPage)).status, 200, 'link back: 200');

    // [B] The admin quiz list: each listed row with quizResultsLink (n).
    const list = adminQuizzes(s, s.math);
    const tEn = words('school', 'en');
    const counts = new Map((await w.p.sql(`SELECT q.id AS id, (SELECT COUNT(*) FROM quiz_attempt a WHERE a.quiz_id = q.id) AS n FROM quiz q WHERE q.space_id = '${s.id}' AND q.subject_id = '${s.math}' AND q.removed_at IS NULL`)).map((r) => [String(r.id), String(r.n)]));
    k = await open(browser, w, ADMIN, list, { lang: 'ar' });
    const rows = quizRowsOf(await k.page.content());
    assert.ok(rows.length >= 2, 'the list has rows');
    for (const r of rows) {
      assert.ok(r.results, `${r.id}: the results link`);
      assert.equal(r.results.text, tAr('quizResultsLink', { n: counts.get(r.id) ?? '?' }), `${r.id}: quizResultsLink (${counts.get(r.id)})`);
      assert.equal(r.results.href, resultsOf(list, r.id), `${r.id}: to the admin scores page`);
    }
    await uxShot(k.page, 'UX-85-phone-ar-admin-list');
    await k.ctx.close();
    // [B] The scores page: success (the note, the count, the table) and empty (the note, then quizResultsNone).
    const scores = resultsOf(list, W7A.QA);
    for (const [lang, width, shot] of [['ar', 'phone', 'UX-85-phone-ar-admin-results'], ['en', 'desktop', 'UX-85-desktop-en-admin-results']] as const) {
      k = await open(browser, w, ADMIN, scores, { lang, width });
      const t = words('school', lang);
      assert.equal(await inDomOrder(k.page, ['#quiz-back', '#quiz-results-title', '#quiz-admin-note', '#quiz-results']), 'ok', `${lang}: back link, title, note, table`);
      assert.equal((await k.page.textContent('#quiz-admin-note'))?.trim(), t('quizAdminScoresNote'), `${lang}: the note`);
      assert.equal((await k.page.textContent('#quiz-results caption'))?.trim(), t('quizResultsCount', { n: '4' }), `${lang}: the count`);
      assert.equal(await k.page.$$eval('#quiz-results tbody tr', (r) => r.length), 4, `${lang}: four rows`);
      await uxShot(k.page, shot);
      await k.ctx.close();
    }
    k = await open(browser, w, ADMIN, resultsOf(list, W7A.QB), { lang: 'en' });
    assert.equal(await inDomOrder(k.page, ['#quiz-admin-note', '#quiz-results-none']), 'ok', 'empty: the note, then quizResultsNone');
    assert.equal((await k.page.textContent('#quiz-results-none'))?.trim(), tEn('quizResultsNone'));
    await k.ctx.close();
    // [B] Errors: 403 for non-admins; 404 for a removed quiz, another subject's address and a page past the end.
    for (const who of [HADEER, SALMA, MONA, OMAR]) assert.equal((await (await as(w, who, 'en')).get(scores)).status, 403, `${who.username}: 403 on the admin scores page`);
    const amal = await as(w, ADMIN, 'en');
    const other = String((await w.p.sql(`SELECT id FROM subject WHERE space_id = '${s.id}' AND id <> '${s.math}' ORDER BY id LIMIT 1`))[0].id);
    assert.equal((await amal.get(resultsOf(adminQuizzes(s, other), W7A.QA))).status, 404, 'another subject\'s address: 404');
    assert.equal((await amal.get(`${scores}?page=9`)).status, 404, 'a page past the end: 404');
    await w.p.sql(`UPDATE quiz SET removed_at = ${AT.noon - 1} WHERE id = '${W7A.QA}'`);
    assert.equal((await amal.get(scores)).status, 404, 'a removed quiz: 404');
    await w.p.sql(`UPDATE quiz SET removed_at = NULL WHERE id = '${W7A.QA}'`);
    assert.equal((await amal.get(scores)).status, 200, 'restored: 200');
    // [B] The answers address: always today's 403 page, for every role (Amal and Rana Test are admins).
    const noAccess = await (await (await as(w, MONA, 'en')).get(linkedPath(s, g.omar))).text();
    for (const who of [ADMIN, RANA5, HADEER, SALMA, MONA]) {
      const res = await (await as(w, who, 'en')).get(`${scores}/${g.salma}`);
      assert.equal(res.status, 403, `${who.username}: 403 on the admin answers address`);
      const body = await res.text();
      assert.equal(/<main[\s\S]*<\/main>/.exec(body)?.[0], /<main[\s\S]*<\/main>/.exec(noAccess)?.[0], `${who.username}: today's 403 page`);
    }
  });

  it('UX-85 widths, targets and keyboard: the guardian page and the admin scores page at 390, 768, 1280 and 320 px with 120-character titles, the hostile title and a 60-character name; the phone table stacks; the fold summary 44 px with a focus ring; Tab order; Enter and Space open the fold; J6 and J7 by keyboard', async () => {
    const { w, g, browser } = x;
    const s = w.school;
    const salmaPage = linkedPath(s, g.salma);
    const list = adminQuizzes(s, s.math);
    const scores = resultsOf(list, W7A.QA);
    const LONG = (p: string) => `${p} ${'كسور Fractions '.repeat(10)}`.slice(0, 120);
    await moreQuizzesFor(w, g.salma, 6, 'ux85-fold');
    await withHostile(w);
    await w.p.sql(`UPDATE subject SET title = '${LONG('الرياضيات Mathematics')}' WHERE id = '${s.math}'`);
    await w.p.sql(`UPDATE quiz SET title = '${LONG('اختبار Quiz')}' WHERE id = '${W7A.QA}'`);
    await w.p.sql(`UPDATE user SET display_name = '${`سلمى Salma ${'اختبار Test '.repeat(6)}`.slice(0, 60)}' WHERE id = '${g.salma}'`);
    const widths: [string, { width: number; height: number }][] = [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]];
    for (const lang of ['ar', 'en'] as const) {
      for (const [who, path] of [[MONA, salmaPage], [ADMIN, scores]] as const) {
        const k = await open(browser, w, who, path, { lang });
        for (const [wname, size] of widths) {
          await k.page.setViewportSize(size);
          await k.page.reload();
          const o = await overflow(k.page);
          assert.ok(o.sideways <= 0, `${lang} ${path} ${wname}: no sideways scroll (${o.sideways})`);
          assert.deepEqual(o.clipped.filter((c) => !/sr-only/.test(c)), [], `${lang} ${path} ${wname}: no clipped text`);
          if (path === scores && size.width <= 600) {
            const stacked = await k.page.$$eval('#quiz-results tbody tr', (trs) => trs.map((tr) => [getComputedStyle(tr).display, ...[...tr.querySelectorAll('td')].map((td) => td.getAttribute('data-label') ?? '')]));
            for (const r of stacked) assert.ok(r[0] === 'block' && r.length === 4 && r.slice(1).every(Boolean), `${lang} ${wname}: each row stacked with its data-labels (${r.join(' | ')})`);
            const note = await k.page.$eval('#quiz-admin-note', (n) => ({ sw: n.scrollWidth, cw: n.clientWidth }));
            assert.ok(note.sw <= note.cw, `${lang} ${wname}: the note wraps, not clipped`);
          }
        }
        await k.ctx.close();
      }
      // The fold summary: a 44 px target with a visible focus ring; it opens with Enter and with Space.
      const k = await open(browser, w, MONA, salmaPage, { lang });
      const page = k.page;
      for (const m of await measure(page, '#quiz-guardian details > summary')) assert.ok(m.width >= 44 && m.height >= 44, `${lang}: ${m.selector} ${m.width}x${m.height}`);
      await page.focus('#quiz-guardian details > summary');
      await page.keyboard.press('Shift+Tab');
      const f = await tab(page);
      assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${lang}: the focus ring on the fold summary (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
      for (const key of ['Enter', 'Space']) {
        await page.reload();
        await page.focus('#quiz-guardian details > summary');
        await page.keyboard.press(key);
        assert.equal(await page.$eval('#quiz-guardian details', (d) => (d as HTMLDetailsElement).open), true, `${lang}: the fold opens with ${key}`);
      }
      // Tab order in DOM order: back link, card, the to-do folds, the results, the quiz fold summary; no trap.
      await page.reload();
      const stops: string[] = [];
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate(() => {
          const e = document.activeElement;
          if (!e || e === document.body) return 'body';
          return e.id === 'back' ? 'back' : e.closest('#linked') ? 'card' : e.closest('#guardian-todo') ? 'todo' : e.closest('#results') ? 'results' : e.closest('#quiz-guardian') ? 'quiz' : e.closest('main') ? 'main' : 'outside';
        });
        stops.push(where);
        if (where === 'body' || (where === 'outside' && stops.includes('quiz'))) break;
      }
      const seq = stops.filter((v, i) => ['back', 'card', 'todo', 'results', 'quiz'].includes(v) && v !== stops[i - 1]);
      assert.deepEqual(seq.filter((v) => v !== 'results'), ['back', 'card', 'todo', 'quiz'], `${lang}: Tab order back link, card, to-do folds, quiz fold (stops: ${stops.join(' ')})`);
      assert.equal(stops.filter((v) => v === 'quiz').length, 1, `${lang}: one stop in the quiz block, its summary`);
      assert.ok(!stops.slice(stops.indexOf('quiz') + 1).some((v) => ['back', 'card', 'todo', 'results'].includes(v)), `${lang}: no way back into the page after the block (no trap)`);
      await k.ctx.close();
    }
    const tabTo = async (page: Page, test: (href: string | null) => boolean, what: string) => {
      for (let i = 0; i < 120; i++) {
        await page.keyboard.press('Tab');
        if (test(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('href') ?? null))) return;
      }
      assert.fail(`${what} is not reached by Tab`);
    };
    const enter = async (page: Page, path: string, what: string) => {
      await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
      assert.equal(new URL(page.url()).pathname, path, `${what}: Enter opens ${path}`);
    };
    // J6 by keyboard only: the guardian home, Salma's link, her page, the quiz fold opened, the back link home.
    let k = await open(browser, w, MONA, `/s/${s.id}/linked`, { lang: 'ar' });
    await tabTo(k.page, (h) => h === salmaPage, 'J6: Salma\'s link');
    await enter(k.page, salmaPage, 'J6');
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) {
      await k.page.keyboard.press('Tab');
      reached = await k.page.evaluate(() => document.activeElement?.matches('#quiz-guardian details > summary') ?? false);
    }
    assert.ok(reached, 'J6: the quiz fold is reached by Tab');
    await k.page.keyboard.press('Enter');
    assert.equal(await k.page.$eval('#quiz-guardian details', (d) => (d as HTMLDetailsElement).open), true, 'J6: Enter opens the fold');
    reached = false;
    for (let i = 0; i < 120 && !reached; i++) {
      await k.page.keyboard.press('Shift+Tab');
      reached = await k.page.evaluate(() => document.activeElement?.id === 'back');
    }
    assert.ok(reached, 'J6: back to the back link by Shift+Tab');
    await enter(k.page, `/s/${s.id}/linked`, 'J6 back link');
    await k.ctx.close();
    // J7 by keyboard only: the admin's subjects, Mathematics, the quiz card's link, QA's scores link, the back link to the list.
    k = await open(browser, w, ADMIN, `/s/${s.id}/admin/topics`, { lang: 'en' });
    await tabTo(k.page, (h) => h === topicPath(s, s.math), 'J7: Mathematics');
    await enter(k.page, topicPath(s, s.math), 'J7');
    await tabTo(k.page, (h) => h === list, 'J7: the quiz card\'s link');
    await enter(k.page, list, 'J7');
    await tabTo(k.page, (h) => h === scores, 'J7: QA\'s results link');
    await enter(k.page, scores, 'J7');
    assert.ok(await k.page.$('#quiz-admin-note'), 'J7: the scores page with its note');
    reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await k.page.keyboard.press('Tab');
      reached = await k.page.evaluate(() => document.activeElement?.id === 'quiz-back');
    }
    assert.ok(reached, 'J7: the back link is reached by Tab');
    await enter(k.page, list, 'J7 back link');
    await k.ctx.close();
  });

  it('UX-85 admin scores page has no control in the table and no answers: no a, button, input or form in the table; the raw bytes and the DOM hold no question, answer, mark, verdict or summary', async () => {
    const { w, g } = x;
    const s = w.school;
    const scores = resultsOf(adminQuizzes(s, s.math), W7A.QA);
    for (const lang of ['ar', 'en'] as const) {
      const res = await (await as(w, ADMIN, lang)).get(scores);
      assert.equal(res.status, 200);
      const raw = await res.text();
      const table = /<table id="quiz-results"[\s\S]*?<\/table>/.exec(raw)?.[0] ?? '';
      assert.ok(table, `${lang}: the table`);
      assert.ok(!/<(a|button|input|form|select|textarea)\b/.test(table), `${lang}: no control in the table`);
      // The raw bytes: no question or answer text or id, no stored-answer field name.
      const markers = [...QA_QUESTIONS.flatMap((q) => [q.text, q.id, ...q.answers.flatMap((a) => [a.id, a.text.length >= 3 ? a.text : `>${a.text}<`])]), 'rightId', 'right_flags', 'answers_json'];
      for (const m of markers) assert.ok(!raw.includes(m), `${lang}: no "${m}" in the raw bytes`);
      // The DOM: no verdict, mark or summary value as a text; no answers, verdict or summary class or id; no link ending in a learner id.
      const whole = [...VERDICT_KEYS.map((key) => UI[lang][key]), UI[lang].quizStatsTitle];
      for (const n of nodesOf(domOf(raw))) {
        if (n.kind === 'text') assert.ok(!whole.includes(n.text.replace(/\s+/g, ' ').trim()), `${lang}: the value "${n.text.trim()}"`);
        if (n.kind !== 'element') continue;
        const cls = (attrOf(n, 'class') ?? '').split(/\s+/);
        for (const c of ['quiz-stats', 'quiz-verdict', 'quiz-is-right', 'quiz-is-chosen', 'quiz-answer', 'quiz-result-body', 'quiz-name']) assert.ok(!cls.includes(c), `${lang}: class ${c}`);
        assert.ok(!['quiz-stats', 'quiz-stats-title'].includes(attrOf(n, 'id') ?? ''), `${lang}: id ${attrOf(n, 'id')}`);
        const href = attrOf(n, 'href') ?? '';
        for (const id of [g.salma, g.omar, g.hala, g.rana]) assert.ok(!href.endsWith(id), `${lang}: no link ending in a learner id (${href})`);
      }
    }
  });
});
