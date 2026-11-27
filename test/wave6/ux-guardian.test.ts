// LMS wave 6, W6-1c: the UX floor of the guardian's view (ux-plan v3 addendum
// on PIL-265, rev f4b8ef73): UX-80 (place, order, read-only), UX-81 (wording,
// the single source of the new strings) and UX-82 (states, widths, sizes and
// keyboard), journey J6. One describe per item, each test its own CI step
// (`UX-<n> ...`, selected with --test-name-pattern), on a fresh world with the
// clock pinned (W6-c) and lesson activity on, in Chromium (Playwright).
// Screenshots go to evidence/ux/ as the ux-plan names them. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { signedIn } from '../support/seed.ts';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { TODO_AHEAD_DAYS } from '../../src/due.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import {
  ADMIN, HADEER, HUDA6, LAILA6, LOAD_ADMIN, LOAD_LEARNER, MONA, OMAR, SALMA, activity, as, browserAs, closeWave6, dPlus, editorPath, go, linkedPath, press, topicPath,
  uxShot, wave6World, withHuda, withKitGuardians, withW5d, withW6f, words, WIDTHS, type W6a, type Wave1World, type Width,
} from './world.ts';
import { guardianTodoOf, withW6d, withW6e } from './todo.ts';
import { showDate } from '../../src/format.ts';

type Lang = 'ar' | 'en';
const GUARDIAN_KEYS = ['guardianTodoTitle', 'guardianTodoNote', 'guardianTodoCapped'] as const satisfies readonly UiKey[];

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

/** The block as the browser lays it out. */
const blockOf = (page: Page) => page.evaluate(() => [...document.querySelectorAll('#guardian-todo .todo-group')].map((g) => ({
  id: g.id,
  tag: g.firstElementChild?.tagName,
  heading: g.querySelector('h3')?.textContent?.trim(),
  shown: g.querySelectorAll(':scope > ul.todo-list > li').length,
  folded: g.querySelectorAll(':scope > details > ul.todo-list > li').length,
  open: (g.querySelector(':scope > details') as HTMLDetailsElement | null)?.open ?? null,
  items: [...g.querySelectorAll('li.todo-item')].map((li) => ({ parts: [...li.children].map((c) => `${c.tagName.toLowerCase()}.${c.className}`), bdi: li.querySelector(':scope > span.due-title > bdi') !== null })),
})));

/** Every element in the block that takes the keyboard's focus or acts (only the folds' summaries may). */
const controlsIn = (page: Page) => page.$$eval('#guardian-todo a, #guardian-todo button, #guardian-todo input, #guardian-todo select, #guardian-todo textarea, #guardian-todo form, #guardian-todo [tabindex], #guardian-todo [onclick]', (els) => els.map((e) => e.outerHTML.slice(0, 80)));

function world(opts: { load?: boolean; kits?: boolean } = {}) {
  const box: { w?: Wave1World; a?: W6a; browser?: Browser; load?: { id: string; learner: string } } = {};
  before(async () => {
    ({ w: box.w, a: box.a } = await wave6World({ activity: true }));
    await withW6f(box.w, box.a);
    if (opts.kits) await withKitGuardians(box.w);
    if (opts.load) {
      const load = await withW5d(box.w);
      await withW6d(box.w.p.sql, load, dPlus);
      await withW6e(box.w.p.sql, load, dPlus);
      box.w.ids[HUDA6.username] = await withHuda(box.w.p.url, load, LOAD_ADMIN.username, LOAD_LEARNER.username);
      await activity(box.w, true, await signedIn(box.w.p.url, LOAD_ADMIN.username, LOAD_ADMIN.password), load.id);
      await box.w.p.sql("UPDATE membership SET valid_from = '2026-01-01' WHERE valid_from > '2026-01-01'");
      box.load = { id: load.id, learner: String((await box.w.p.sql(`SELECT id FROM user WHERE username = '${LOAD_LEARNER.username}'`))[0].id) };
    }
    box.browser = await chromium.launch();
  });
  after(async () => {
    await box.browser?.close();
    await closeWave6(box.w);
  });
  return box as { w: Wave1World; a: W6a; browser: Browser; load: { id: string; learner: string } };
}

// ------------------------------------------------------------------- UX-80 ----
describe('UX-80 guardian to-do block: place, order, read-only', { concurrency: false }, () => {
  const x = world({ load: true });

  it('UX-80 guardian block place, order and read-only: after #linked and before #results; h2 with the name in <bdi>, the note in the secondary style, h3 groups with counts, 3 shown and a closed fold; plain-text titles then the line; no control but the fold summaries; overdue told by words, not colour', async () => {
    const { w, browser, load } = x;
    const s = w.school;
    const salmaPage = linkedPath(s, w.ids[SALMA.username]);
    for (const [lang, width, shot] of [['ar', 'phone', 'UX-80-phone-ar'], ['ar', 'tablet', 'UX-80-tablet-ar'], ['en', 'desktop', 'UX-80-desktop-en']] as const) {
      const k = await open(browser, w, MONA, salmaPage, { lang, width });
      const page = k.page;
      const t = words('school', lang);
      assert.equal(await inDomOrder(page, ['#linked', '#guardian-todo', '#results']), 'ok', `${lang} ${width}: after #linked, before #results`);
      assert.equal(await inDomOrder(page, ['#guardian-todo > h2', '#guardian-todo > p.muted', '#guardian-todo .todo-group']), 'ok', `${lang}: heading, note, groups`);
      assert.equal((await page.textContent('#guardian-todo > h2'))?.replace(/\s+/g, ' ').trim(), t('guardianTodoTitle', { name: SALMA.display_name }), `${lang}: guardianTodoTitle`);
      assert.equal((await page.textContent('#guardian-todo > h2 > bdi'))?.trim(), SALMA.display_name, `${lang}: the name in <bdi>`);
      assert.equal((await page.textContent('#guardian-todo > p.muted'))?.trim(), t('guardianTodoNote'), `${lang}: guardianTodoNote`);
      const tone = await page.evaluate(() => {
        const c = (sel: string) => getComputedStyle(document.querySelector(sel)!).color;
        return { note: c('#guardian-todo > p.muted'), line: c('#guardian-todo .todo-line'), text: c('#guardian-todo > h2') };
      });
      assert.ok(tone.note !== tone.text, `${lang}: the note in the secondary text colour (${tone.note}), not the heading's (${tone.text})`);
      for (const m of await measure(page, '#guardian-todo > p.muted, #guardian-todo .todo-line, #guardian-todo h3, #guardian-todo .due-title, #guardian-todo details > summary')) {
        if (m.text.trim()) assert.ok(m.contrast >= 4.5, `${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
      }
      const groups = await blockOf(page);
      assert.deepEqual(groups.map((g) => g.id), ['guardian-todo-overdue', 'guardian-todo-today', 'guardian-todo-next'], `${lang}: overdue, today, next 7 days`);
      assert.deepEqual(groups.map((g) => g.tag), ['H3', 'H3', 'H3'], `${lang}: each group starts with its h3`);
      assert.deepEqual(groups.map((g) => g.heading), [t('todoOverdue', { n: '1' }), t('todoToday', { n: '2' }), t('todoNext7', { n: '5', days: String(TODO_AHEAD_DAYS) })], `${lang}: the headings with the full counts`);
      assert.deepEqual([groups[2].shown, groups[2].folded, groups[2].open], [3, 2, false], `${lang}: 3 shown, a closed fold of 2`);
      for (const g of groups) for (const i of g.items) {
        assert.deepEqual(i.parts, ['span.due-title', 'p.todo-line'], `${lang}: the plain-text title, then the line`);
        assert.ok(i.bdi, `${lang}: the title in <bdi>`);
      }
      assert.deepEqual(await controlsIn(page), [], `${lang}: no link, button, field or form in the block`);
      const look = await page.$$eval('#guardian-todo .todo-group', (gs) => gs.map((g) => {
        const h = getComputedStyle(g.querySelector('h3')!);
        const ti = getComputedStyle(g.querySelector('.due-title')!);
        return { h: h.color, hb: h.backgroundColor, t: ti.color, bg: getComputedStyle(g).backgroundColor, img: g.querySelectorAll('img, svg').length };
      }));
      for (const g of look.slice(1)) assert.deepEqual(g, look[0], `${lang}: the overdue group is styled as the others (no red, no icon)`);
      await uxShot(page, shot);
      if (shot === 'UX-80-phone-ar') {
        await page.click('#guardian-todo-next details > summary');
        assert.equal(await page.$eval('#guardian-todo-next details', (d) => (d as HTMLDetailsElement).open), true, 'the fold opens');
        await uxShot(page, 'UX-80-phone-ar-open');
      }
      await k.ctx.close();
    }
    // Capped (W6-e, Huda Test): the overdue fold ends with guardianTodoCapped.
    const k = await open(browser, w, HUDA6, linkedPath(load, load.learner), { lang: 'ar' });
    await k.page.click('#guardian-todo-overdue details > summary');
    const capped = (await k.page.textContent('#guardian-todo-overdue details > p.todo-capped'))?.trim() ?? '';
    assert.match(capped, new RegExp(`^${UI.ar.guardianTodoCapped.replace('{n}', '\\d+').replace(/\./g, '\\.')}$`), 'guardianTodoCapped at the end of the open fold');
    assert.equal(await k.page.$eval('#guardian-todo-overdue details', (d) => d.lastElementChild?.className), 'todo-capped', 'the capped line ends the fold');
    await uxShot(k.page, 'UX-80-phone-ar-capped');
    await k.ctx.close();
  });

  it('UX-80 guardian block absent when nothing listed or activity off: no block and no empty message; with activity off the activity-off line alone', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    const salmaPage = linkedPath(s, w.ids[SALMA.username]);
    const salma = await as(w, SALMA, 'en');
    const listed = (await w.p.sql(`SELECT id FROM lesson WHERE space_id = '${s.id}' AND removed_at IS NULL AND (due_on IS NOT NULL OR chapter_id = '${a.C2}')`)).map((r) => String(r.id));
    for (const id of listed) await press(salma, s, id, 'done');
    for (const lang of ['ar', 'en'] as const) {
      const doc = await (await (await as(w, MONA, lang)).get(salmaPage)).text();
      assert.equal(guardianTodoOf(doc), null, `${lang}: nothing listed: no block`);
      for (const key of GUARDIAN_KEYS) assert.ok(!doc.includes(UI[lang][key].split('{')[0].trim()), `${lang}: no ${key}, no empty message`);
    }
    await w.p.sql('DELETE FROM done_mark');
    assert.ok(guardianTodoOf(await (await (await as(w, MONA, 'en')).get(salmaPage)).text()), 'marks undone: the block is back');
    await activity(w, false);
    for (const lang of ['ar', 'en'] as const) {
      const doc = await (await (await as(w, MONA, lang)).get(salmaPage)).text();
      assert.equal(guardianTodoOf(doc), null, `${lang}: activity off: no block`);
      assert.match(doc, /<p id="activity-off" class="card message" data-activity>/, `${lang}: activity off: the activity-off line`);
    }
    await activity(w, true);
    const k = await open(browser, w, MONA, salmaPage, { lang: 'ar' });
    assert.ok(await k.page.$('#guardian-todo'), 'activity on again: the block at the next load');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-81 ----
const DENY = ['أنت', 'لك', 'عليك', 'هذا', 'هذه', 'ذلك', 'تلك', 'توقفت', 'بدأت', 'السابق', 'السابقة', 'التالية', 'الجديد', 'الجديدة'];
const noMarks = (v: string) => v.replace(/[ً-ْ]/g, '');
const tokensOf = (v: string) => noMarks(v).replace(/{[^}]*}/g, ' ').split(/[\s.,:;()«»"،·؟?]+/).filter(Boolean);

describe('UX-81 wording for the guardian', { concurrency: false }, () => {
  const x = world({ kits: true });

  it('UX-81 guardian keys: language, deny list, pronouns, neighbours in every kit', async () => {
    const { w, browser } = x;
    // The values: the ux-plan's table, word for word; no second person, imperative, demonstrative or attached pronoun; no spaced slash.
    const TABLE: Record<(typeof GUARDIAN_KEYS)[number], { en: string; ar: string }> = {
      guardianTodoTitle: { en: 'To do: {name}', ar: 'قائمة المهام: {name}' },
      guardianTodoNote: { en: 'Read only. An item leaves the list when it is done.', ar: 'للاطلاع فقط. تخرج كل مهمة من القائمة عند الإنجاز.' },
      guardianTodoCapped: { en: 'Other items not shown: {n}.', ar: 'مهام أخرى غير معروضة: {n}.' },
    };
    for (const key of GUARDIAN_KEYS) {
      assert.deepEqual({ en: UI.en[key], ar: UI.ar[key] }, TABLE[key], `${key}: the ux-plan's values`);
      const tokens = tokensOf(UI.ar[key]);
      for (const bad of DENY) assert.ok(!tokens.includes(noMarks(bad)), `${key}: no "${bad}"`);
      for (const word of tokens) if (/[؀-ۿ]/.test(word) && word.length >= 3) assert.ok(!/(ه|ها|هم|هن|ك|كم)$/.test(word), `${key}: "${word}" ends in an attached pronoun`);
      for (const lang of ['ar', 'en'] as const) assert.ok(!/\s\/\s/.test(UI[lang][key]), `${lang} ${key}: no spaced slash`);
      assert.ok(!/[؀-ۿ]/.test(UI.en[key]) && !/[A-Za-z]{2,}/.test(UI.ar[key].replace(/{[^}]*}/g, '')), `${key}: each language's value in its own script`);
    }
    // The new dueCardHelp sentence in every kit's actual words: «قائمة <learner>،» and «صفحة <guardian> عند»; neither neighbour agrees with the kit word.
    for (const kit of ['school', 'company', 'university'] as const) {
      for (const lang of ['ar', 'en'] as const) {
        const t = words(kit, lang);
        const low = (k: 'learner' | 'guardian') => t(k).toLocaleLowerCase(lang);
        const help = t('dueCardHelp', { chapter: low('learner'), lesson: low('learner'), subject: low('learner'), learner: low('learner'), guardian: low('guardian'), days: '7' });
        if (lang === 'ar') {
          assert.ok(help.includes(`إلا في قائمة ${low('learner')}، وفي صفحة ${low('guardian')} عند وجود ربط.`), `${kit} ar: «قائمة ${low('learner')}،» and «صفحة ${low('guardian')} عند» (${help.slice(-80)})`);
          for (const word of [...tokensOf(UI.ar.dueCardHelp)]) assert.ok(!DENY.map(noMarks).includes(word), `${kit} ar: no "${word}"`);
        } else {
          assert.ok(help.endsWith(`Lateness is shown only on the ${low('learner')}'s list and, where a link exists, on the ${low('guardian')}'s page.`), `${kit} en: the new last sentence (${help.slice(-110)})`);
        }
        assert.ok(!help.includes('Nobody else is shown who is late') && !help.includes('لا يُعرض التأخّر لأي شخص آخر'), `${kit} ${lang}: v2's last sentence is gone`);
      }
    }
    // On the page, in each kit and language: lang and dir, the name in <bdi>, dates Latin YYYY-MM-DD in dir="ltr", no value of the other language.
    for (const space of [w.company, w.university]) {
      for (const lang of ['ar', 'en'] as const) {
        const other = lang === 'ar' ? 'en' : 'ar';
        const k = await open(browser, w, LAILA6, linkedPath(space, w.ids[SALMA.username]), { lang });
        const page = k.page;
        assert.deepEqual(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), [lang, lang === 'ar' ? 'rtl' : 'ltr'], `${space.kit} ${lang}: lang and dir`);
        const t = words(space.kit, lang);
        // LMS redesign R1a (UX-16a row): the date as S4 shows it (day and month name, Latin digits) in the page's direction.
        const shown = showDate('2026-12-10', lang, '2026-12-10');
        assert.equal((await page.textContent('#guardian-todo .todo-line'))?.replace(/\s+/g, ' ').trim(), t('todoItemLine', { kind: t('lesson'), subjectTitle: 'Mathematics', date: shown }), `${space.kit} ${lang}: the kit's word in the line`);
        assert.deepEqual(await page.$$eval('#guardian-todo .due-date', (ds) => ds.map((d) => [d.getAttribute('dir'), d.textContent])), [[lang === 'ar' ? 'rtl' : 'ltr', shown]], `${space.kit} ${lang}: the date S4, Latin digits`);
        const text = (await page.textContent('#guardian-todo')) ?? '';
        for (const key of GUARDIAN_KEYS) assert.ok(!text.includes(UI[other][key].split('{')[0].trim()), `${space.kit} ${lang}: no ${other} ${key}`);
        if (lang === 'ar') await uxShot(page, `UX-81-phone-ar-${space.kit}`);
        await k.ctx.close();
      }
    }
  });

  it('UX-81 due card help names who sees lateness: the editor and the subject admin page, three kits, Arabic and English', async () => {
    const { w, browser } = x;
    const editors: [string, { username: string; password: string }, string][] = [
      ['school', HADEER, editorPath(w.school, w.school.math)], ['school', ADMIN, topicPath(w.school, w.school.math)],
      ['company', { username: 'hadeer.trainer', password: HADEER.password }, editorPath(w.company, w.company.math)],
      ['university', { username: 'hadeer.lecturer', password: HADEER.password }, editorPath(w.university, w.university.math)],
    ];
    for (const [kit, who, path] of editors) {
      for (const lang of ['ar', 'en'] as const) {
        const k = await open(browser, w, who, path, { lang });
        const t = words(kit as 'school', lang);
        const low = (key: 'chapter' | 'lesson' | 'subject' | 'learner' | 'guardian') => t(key).toLocaleLowerCase(lang);
        const help = t('dueCardHelp', { chapter: low('chapter'), lesson: low('lesson'), subject: low('subject'), learner: low('learner'), guardian: low('guardian'), days: String(TODO_AHEAD_DAYS) });
        assert.equal((await k.page.textContent('#due-dates .due-help'))?.trim(), help, `${kit} ${lang} ${path}: the help line names the learner and, with a link, the guardian`);
        await k.ctx.close();
      }
    }
  });
});

// ------------------------------------------------------------------- UX-82 ----
describe('UX-82 states, widths, sizes and keyboard for the guardian page', { concurrency: false }, () => {
  const x = world({ load: true });

  it('UX-82 guardian page states: empty (no block, today\'s page), activity off (the activity-off line, no block), not linked (today\'s 403), success (groups, fold and, past 10, guardianTodoCapped)', async () => {
    const { w, a, browser, load } = x;
    const s = w.school;
    const salmaPage = linkedPath(s, w.ids[SALMA.username]);
    // Success, with the cap (Huda Test, W6-e).
    let k = await open(browser, w, HUDA6, linkedPath(load, load.learner), { lang: 'ar' });
    assert.ok(await k.page.$('#guardian-todo-overdue details > p.todo-capped'), 'success: groups, fold and guardianTodoCapped');
    await k.ctx.close();
    // Error: not linked (Mona at Omar C's page) gives today's 403.
    const mona = await as(w, MONA, 'ar');
    const refused = await mona.get(linkedPath(s, w.ids[OMAR.username]));
    assert.equal(refused.status, 403, 'not linked: 403');
    assert.equal(guardianTodoOf(await refused.text()), null, 'not linked: no block');
    // Activity off: the activity-off line, no block.
    await activity(w, false);
    k = await open(browser, w, MONA, salmaPage, { lang: 'ar' });
    assert.ok(await k.page.$('#activity-off') && !(await k.page.$('#guardian-todo')), 'activity off: the line, no block');
    await uxShot(k.page, 'UX-82-phone-ar-activity-off');
    await k.ctx.close();
    await activity(w, true);
    // Empty: nothing listed for Salma, no block and no empty message.
    const salma = await as(w, SALMA, 'en');
    for (const r of await w.p.sql(`SELECT id FROM lesson WHERE space_id = '${s.id}' AND removed_at IS NULL AND (due_on IS NOT NULL OR chapter_id = '${a.C2}')`)) await press(salma, s, String(r.id), 'done');
    k = await open(browser, w, MONA, salmaPage, { lang: 'ar' });
    assert.ok(!(await k.page.$('#guardian-todo')) && (await k.page.$('#results')), 'empty: no block, the results as today');
    assert.ok(!((await k.page.textContent('main')) ?? '').includes(UI.ar.guardianTodoNote), 'empty: no empty message');
    await uxShot(k.page, 'UX-82-phone-ar-empty');
    await k.ctx.close();
    await w.p.sql('DELETE FROM done_mark');
  });

  it('UX-82 guardian page widths, targets and keyboard: 390, 768, 1280 and 320 px with 120-character titles and a 60-character name; 44 px fold summaries with a focus ring; Tab order back link, card, summaries, results; folds open with Enter and Space; J6 by keyboard', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    const salmaPage = linkedPath(s, w.ids[SALMA.username]);
    const LONG = (p: string) => `${p} ${'كسور Fractions '.repeat(10)}`.slice(0, 120);
    await w.p.sql(`UPDATE subject SET title = '${LONG('الرياضيات Mathematics')}' WHERE id = '${s.math}'`);
    await w.p.sql(`UPDATE lesson SET title = '${LONG('درس Lesson')}' WHERE id = '${a.L.L1}'`);
    await w.p.sql(`UPDATE chapter SET title = '${LONG('وحدة Unit')}' WHERE id = '${a.C2}'`);
    await w.p.sql(`UPDATE user SET display_name = '${`سلمى Salma ${'اختبار Test '.repeat(6)}`.slice(0, 60)}' WHERE id = '${w.ids[SALMA.username]}'`);
    const widths: [string, { width: number; height: number }][] = [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]];
    for (const lang of ['ar', 'en'] as const) {
      const k = await open(browser, w, MONA, salmaPage, { lang });
      const page = k.page;
      for (const [wname, size] of widths) {
        await page.setViewportSize(size);
        await page.reload();
        const o = await overflow(page);
        assert.ok(o.sideways <= 0, `${lang} ${wname}: no sideways scroll (${o.sideways})`);
        assert.deepEqual(o.clipped.filter((c) => !/sr-only/.test(c)), [], `${lang} ${wname}: no clipped text`);
      }
      await page.setViewportSize(WIDTHS.phone);
      await page.reload();
      for (const m of await measure(page, '#guardian-todo details > summary')) assert.ok(m.width >= 44 && m.height >= 44, `${lang}: ${m.selector} ${m.width}x${m.height}`);
      await page.focus('#guardian-todo-next details > summary');
      await page.keyboard.press('Shift+Tab');
      const f = await tab(page);
      assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${lang}: the focus ring on the fold summary (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
      for (const key of ['Enter', 'Space']) {
        await page.reload();
        await page.focus('#guardian-todo-next details > summary');
        await page.keyboard.press(key);
        assert.equal(await page.$eval('#guardian-todo-next details', (d) => (d as HTMLDetailsElement).open), true, `${lang}: the fold opens with ${key}`);
      }
      // Tab order from the top: every stop in DOM order, the back link, the card, the block's summaries, the results; no trap.
      await page.reload();
      const stops: string[] = [];
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate(() => {
          const e = document.activeElement;
          if (!e || e === document.body) return 'body';
          return e.id === 'back' ? 'back' : e.closest('#linked') ? 'card' : e.closest('#guardian-todo') ? 'summary' : e.closest('#results') ? 'results' : e.closest('main') ? 'main' : 'outside';
        });
        stops.push(where);
        if (where === 'body' || (stops.length > 5 && where === 'outside' && stops.includes('summary'))) break;
      }
      const seq = stops.filter((x, i) => ['back', 'card', 'summary', 'results'].includes(x) && x !== stops[i - 1]);
      assert.deepEqual(seq.filter((x) => x !== 'results'), ['back', 'card', 'summary'], `${lang}: Tab order back link, card, summaries (stops: ${stops.join(' ')})`);
      assert.ok(stops.indexOf('summary') > stops.indexOf('card') && !stops.slice(stops.lastIndexOf('summary') + 1).includes('card'), `${lang}: no way back into the card after the block (no trap)`);
      await k.ctx.close();
    }
    // J6 by keyboard only: the guardian home, Salma's card link, her page, the fold opened, the back link home.
    const k = await open(browser, w, MONA, `/s/${s.id}/linked`, { lang: 'ar' });
    const page = k.page;
    let reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate((p) => (document.activeElement as HTMLAnchorElement | null)?.getAttribute('href') === p, salmaPage);
    }
    assert.ok(reached, 'J6: Salma\'s link on her glance card is reached by Tab');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    assert.equal(new URL(page.url()).pathname, salmaPage, 'J6: Enter opens Salma\'s page');
    reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.matches('#guardian-todo-next details > summary') ?? false);
    }
    assert.ok(reached, 'J6: the fold of the next 7 days is reached by Tab');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('#guardian-todo-next details', (d) => (d as HTMLDetailsElement).open), true, 'J6: Enter opens the fold');
    await page.keyboard.press('Shift+Tab');
    reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
      reached = await page.evaluate(() => document.activeElement?.id === 'back');
      if (!reached) await page.keyboard.press('Shift+Tab');
    }
    assert.ok(reached, 'J6: back to the back link by Shift+Tab');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    assert.equal(new URL(page.url()).pathname, `/s/${s.id}/linked`, 'J6: the back link leads to the guardian home');
    await k.ctx.close();
  });
});
