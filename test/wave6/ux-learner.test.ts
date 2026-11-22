// LMS wave 6, W6-1b: the UX floor of the learner's side (ux-plan v2 on
// PIL-257, rev 0184610f): UX-62 (the home's to-do block), UX-63 (the outline's
// due lines), UX-67 (the preview), and the learner parts of UX-64, UX-65 and
// UX-66 (the teacher parts are in test/wave6/ux.test.ts; the same CI steps run
// both files). One describe per item, each test its own CI step (`UX-<n> ...`,
// selected with --test-name-pattern), each on a fresh world with the clock
// pinned (W6-c), in Chromium (Playwright). Screenshots go to evidence/ux/ as
// the ux-plan names them. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { TODO_AHEAD_DAYS, TODO_MAX_PER_GROUP } from '../../src/due.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import {
  ADMIN, AT, HADEER, KARIM5, LOAD_LEARNER, NOUR6, SALMA, as, browserAs, closeWave6, dPlus, go, home, press, storedAt, subjectPath, uxShot,
  wave6World, withW5a, withW5d, withW6b, words, WIDTHS, YARA6, type W6a, type Wave1World, type Width,
} from './world.ts';
import { dueLinesOf, listed, todoOf, withW6d, withW6e } from './todo.ts';

type Lang = 'ar' | 'en';
const HOUR = 3_600_000;

/** The wave 6 keys a learner reads (ux-plan UX-64). */
const LEARNER_KEYS = ['todoTitle', 'todoOverdue', 'todoToday', 'todoNext7', 'todoMore', 'todoCapped', 'todoItemLine', 'dueOn'] as const satisfies readonly UiKey[];

async function open(browser: Browser, w: Wave1World, who: { username: string; password: string }, path: string, opts: { width?: Width; lang?: Lang } = {}) {
  const tabbed = await browserAs(browser, w, who, { width: opts.width ?? 'phone', lang: opts.lang ?? 'ar' });
  await go(tabbed.page, w, path);
  return tabbed;
}

/** Whether every selector is found, in this DOM order. */
const inDomOrder = (page: Page, selectors: string[]) => page.evaluate((sels) => {
  const els = sels.map((s) => document.querySelector(s));
  if (els.some((e) => !e)) return `missing: ${sels.filter((_, i) => !els[i]).join(', ')}`;
  for (let i = 1; i < els.length; i++) {
    if (!(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING)) return `${sels[i - 1]} is not before ${sels[i]}`;
  }
  return 'ok';
}, selectors);

/** The block as the browser lays it out: each group's heading, item kinds, folded or not, the fold's state. */
const blockOf = (page: Page) => page.evaluate(() => [...document.querySelectorAll('#todo .todo-group')].map((g) => ({
  key: g.getAttribute('data-group'),
  tag: g.firstElementChild?.tagName,
  heading: g.querySelector('h3')?.textContent?.trim(),
  shown: [...g.querySelectorAll(':scope > ul.todo-list > li')].length,
  folded: [...g.querySelectorAll(':scope > details > ul.todo-list > li')].length,
  open: (g.querySelector(':scope > details') as HTMLDetailsElement | null)?.open ?? null,
  capped: g.querySelector('.todo-capped')?.textContent?.trim() ?? null,
  items: [...g.querySelectorAll('li.todo-item')].map((li) => ({ parts: [...li.children].map((c) => c.className), href: li.querySelector('a')?.getAttribute('href') })),
})));

/** A preview page's addresses as the learner's. */
const unpreviewed = (doc: string, spaceId: string) => doc.split(`/s/${spaceId}/preview`).join(`/s/${spaceId}`).replace(/(\?|&amp;)from=[^"#&]*/g, '').replace(/"\/s\/([^"?]+)&amp;/g, '"/s/$1?');

function world(opts: { activity?: boolean } = {}) {
  const box: { w?: Wave1World; a?: W6a; browser?: Browser } = {};
  before(async () => {
    ({ w: box.w, a: box.a } = await wave6World({ activity: opts.activity }));
    box.browser = await chromium.launch();
  });
  after(async () => {
    await box.browser?.close();
    await closeWave6(box.w);
  });
  return box as { w: Wave1World; a: W6a; browser: Browser };
}

// ------------------------------------------------------------------- UX-62 ----
describe('UX-62 learner home to-do block (W6-a)', { concurrency: false }, () => {
  const x = world();

  it('UX-62 home to-do order, groups, fold and empty case: after Continue and before the cards; h2, then h3 groups with counts and lists; 3 shown and a closed fold of 2; title link then line; overdue told by words, not colour; no block and no empty message once all is done', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    // A lesson marked done earlier gives the home its "Continue where you stopped" area with a link (wave 2).
    assert.equal((await press(await as(w, SALMA, 'en'), s, s.lessons['Adding fractions'], 'done')).status, 303);
    for (const [lang, width] of [['ar', 'phone'], ['ar', 'tablet'], ['en', 'desktop']] as const) {
      const k = await open(browser, w, SALMA, home(s), { lang, width });
      const page = k.page;
      assert.equal(await inDomOrder(page, ['#continue', '#todo', '#my-list']), 'ok', `${lang} ${width}: after Continue, before the cards`);
      assert.equal((await page.textContent('#todo > h2'))?.trim(), UI[lang].todoTitle, `${lang}: h2 todoTitle`);
      const t = words('school', lang);
      const groups = await blockOf(page);
      assert.deepEqual(groups.map((g) => g.key), ['overdue', 'today', 'next'], `${lang}: overdue, today, next 7 days`);
      assert.deepEqual(groups.map((g) => g.tag), ['H3', 'H3', 'H3'], `${lang}: each group starts with its h3`);
      assert.deepEqual(groups.map((g) => g.heading), [t('todoOverdue', { n: '1' }), t('todoToday', { n: '2' }), t('todoNext7', { n: '5', days: String(TODO_AHEAD_DAYS) })], `${lang}: the headings with the full counts`);
      const next = groups[2];
      assert.deepEqual([next.shown, next.folded, next.open], [3, 2, false], `${lang}: 3 shown, a closed fold of 2`);
      assert.equal((await page.textContent('#todo [data-group="next"] details > summary'))?.trim(), t('todoMore', { n: '2' }), `${lang}: todoMore`);
      for (const g of groups) for (const it of g.items) assert.deepEqual(it.parts.slice(0, 2), ['todo-link', 'todo-line'], `${lang}: title link, then the line`);
      // Overdue by its words alone: its heading, items and links look as the other groups' (same colours, no icon).
      const look = await page.$$eval('#todo .todo-group', (gs) => gs.map((g) => {
        const h = getComputedStyle(g.querySelector('h3')!);
        const l = getComputedStyle(g.querySelector('a.todo-link')!);
        return { h: h.color, hb: h.backgroundColor, l: l.color, bg: getComputedStyle(g).backgroundColor, img: g.querySelectorAll('img, svg').length };
      }));
      for (const g of look.slice(1)) assert.deepEqual(g, look[0], `${lang}: the overdue group is styled as the others (told apart by its heading)`);
      if (lang === 'ar' && width === 'phone') {
        await uxShot(page, 'UX-62-phone-ar');
        await page.click('#todo [data-group="next"] details > summary');
        assert.equal(await page.$eval('#todo [data-group="next"] details', (d) => (d as HTMLDetailsElement).open), true, 'the fold opens');
        await uxShot(page, 'UX-62-phone-ar-open');
      }
      if (lang === 'ar' && width === 'tablet') await uxShot(page, 'UX-62-tablet-ar');
      if (lang === 'en') await uxShot(page, 'UX-62-desktop-en');
      await k.ctx.close();
    }
    // After L1 and L2: the overdue group is gone, today keeps G1.
    const salma = await as(w, SALMA, 'en');
    for (const l of [a.L.L1, a.L.L2]) assert.equal((await press(salma, s, l, 'done')).status, 303);
    const k = await open(browser, w, SALMA, home(s), { lang: 'ar' });
    assert.deepEqual((await blockOf(k.page)).map((g) => g.key), ['today', 'next'], 'after L1 and L2: no overdue group');
    await uxShot(k.page, 'UX-62-phone-ar-after-done');
    await k.ctx.close();
    // Everything done: no block and no empty message.
    for (const l of [a.G1, a.L.L3, a.L.L8, a.L.L9, a.L.L4, ...Object.values(s.lessons).filter((id) => !Object.values(a.L).includes(id))]) await press(salma, s, l, 'done');
    for (const lang of ['ar', 'en'] as const) {
      const doc = await (await (await as(w, SALMA, lang)).get(home(s))).text();
      assert.equal(todoOf(doc), null, `${lang}: no block when nothing is left`);
      assert.ok(!doc.includes(UI[lang].todoTitle), `${lang}: no heading, no empty message`);
    }
  });

  it('UX-62 chapter link opens its chapter: following C2\'s item shows details#chapter-<C2> open, at its place', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    await w.p.sql(`DELETE FROM done_mark`);
    const k = await open(browser, w, SALMA, home(s), { lang: 'ar' });
    const page = k.page;
    await page.click('#todo [data-group="next"] details > summary').catch(() => null);
    const link = page.locator(`#todo li[data-item="${a.C2}"] a.todo-link`);
    assert.equal(await link.getAttribute('href'), `/s/${s.id}/learn/${s.math}?open=${a.C2}#chapter-${a.C2}`, 'the chapter link');
    await Promise.all([page.waitForEvent('load'), link.click()]);
    assert.equal(await page.$eval(`details#chapter-${a.C2}`, (d) => (d as HTMLDetailsElement).open), true, 'the chapter is open');
    const top = await page.$eval(`details#chapter-${a.C2}`, (d) => d.getBoundingClientRect().top);
    assert.ok(top >= -1 && top < WIDTHS.phone.height, `the chapter is in view (${top})`);
    await k.ctx.close();
  });
});

describe('UX-62 learner home to-do block (W6-e and the first phone screen)', { concurrency: false }, () => {
  const x = world({ activity: true });

  it('UX-62 capped group line: at W6-e the overdue group draws 10, its fold of 7 ends with todoCapped', async () => {
    const { w, browser } = x;
    const load = await withW5d(w);
    await withW6d(w.p.sql, load, dPlus);
    await withW6e(w.p.sql, load, dPlus);
    const k = await open(browser, w, LOAD_LEARNER, home(load), { lang: 'ar' });
    const page = k.page;
    const over = (await blockOf(page)).find((g) => g.key === 'overdue')!;
    const count = 300 + 75; // every lesson, and the 75 dated chapters of the subjects not in order (the others are locked behind their first chapter)
    assert.deepEqual([over.shown, over.folded], [3, TODO_MAX_PER_GROUP - 3], 'the first 3 shown, 7 in the fold');
    assert.equal(over.heading, words('school', 'ar')('todoOverdue', { n: String(over.heading?.match(/\d+/)?.[0]) }), 'the heading with its full count');
    assert.ok(Number(over.heading?.match(/\d+/)?.[0]) > TODO_MAX_PER_GROUP, `more than 10 (${over.heading}; up to ${count})`);
    await page.click('#todo [data-group="overdue"] details > summary');
    const capped = await page.$eval('#todo [data-group="overdue"] details', (d) => ({ last: d.lastElementChild?.className, text: d.querySelector('.todo-capped')?.textContent?.trim() }));
    const n = Number(over.heading!.match(/\d+/)![0]);
    assert.deepEqual(capped, { last: 'todo-capped', text: words('school', 'ar')('todoCapped', { n: String(n - TODO_MAX_PER_GROUP), subject: words('school', 'ar')('subject').toLocaleLowerCase('ar') }) }, 'the fold ends with todoCapped');
    await uxShot(page, 'UX-62-phone-ar-capped');
    await k.ctx.close();
  });

  it('UX-62 continue stays on the first phone screen with to-do: at 390 x 844 in Arabic, with the activity notice, three cut announcements and the W6-a block (and W6-e\'s full groups), the bottom of the Continue link is at most 844 px from the top', async (t) => {
    const { w, browser } = x;
    const s = w.school;
    // Wave 5's UX-55 world: three long announcements on Salma's subjects (dated before the pinned instant); a lesson done for the Continue link.
    const long = [
      'الاختبار القصير يوم الأحد بدلًا من الخميس. راجعوا الفصلين 2 و3، وأحضروا الآلة الحاسبة والمسطرة، والاختبار في القاعة 4 الساعة 9 صباحًا.',
      `${'x'.repeat(300)}`,
      'Parents evening on Monday at 5 pm in the main hall. Every family is welcome; the teachers will talk about the first term and the next steps.',
    ];
    await storedAt(w, { space: s.id, subject: s.math, body: long[2], role: 'admin', at: AT.noon - 3 * HOUR });
    await storedAt(w, { space: s.id, subject: s.arabic, body: long[1], role: 'admin', at: AT.noon - 2 * HOUR });
    await storedAt(w, { space: s.id, subject: s.math, body: long[0], role: 'publisher', at: AT.noon - HOUR });
    assert.equal((await press(await as(w, SALMA, 'en'), s, s.lessons['Adding fractions'], 'done')).status, 303);
    // W6-e: built here when this test runs alone (its CI step selects it by name), else the capped test's world is reused.
    if (!(await w.p.sql(`SELECT id FROM space WHERE name = 'Load Test Space'`)).length) {
      const built = await withW5d(w);
      await withW6d(w.p.sql, built, dPlus);
      await withW6e(w.p.sql, built, dPlus);
    }
    const load = (await w.p.sql(`SELECT id FROM space WHERE name = 'Load Test Space'`))[0];
    const spaces: [string, { username: string; password: string }, string][] = [['W6-a', SALMA, home(s)]];
    if (load) {
      // The load learner (W6-e, all overdue): a lesson done for the Continue link.
      const first = String((await w.p.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id JOIN subject x ON x.id = c.subject_id WHERE l.space_id = '${load.id}' AND x.chapters_in_order = 0 ORDER BY x.title LIMIT 1`))[0].id);
      assert.equal((await press(await as(w, LOAD_LEARNER, 'en'), { id: String(load.id) }, first, 'done')).status, 303);
      spaces.push(['W6-e', LOAD_LEARNER, `/s/${load.id}`]);
    }
    const figures: string[] = [];
    for (const [name, who, path] of spaces) {
      const k = await open(browser, w, who, path, { lang: 'ar', width: 'phone' });
      try {
        const m = await k.page.evaluate(() => {
          const link = document.querySelector('#continue-link');
          return {
            todo: Boolean(document.querySelector('#todo')),
            ann: document.querySelectorAll('#announcements .ann-item').length,
            bottom: link ? link.getBoundingClientRect().bottom + window.scrollY : null,
          };
        });
        figures.push(`${name}: ${m.bottom === null ? 'none' : m.bottom.toFixed(1)} px of 844 (to-do block ${m.todo ? 'present' : 'absent'}, ${m.ann} announcements)`);
        assert.ok(m.todo, `${name}: a to-do block is present`);
        assert.ok(m.bottom !== null && m.bottom <= 844, `${name}: the Continue link ends within the first phone screen (${m.bottom})`);
      } finally {
        await k.ctx.close();
      }
    }
    assert.ok(spaces.length === 2, 'measured with W6-a and with W6-e');
    t.diagnostic(`UX-62 first phone screen, bottom of "Continue where you stopped": ${figures.join('; ')}`);
  });
});

// ------------------------------------------------------------------- UX-63 ----
describe('UX-63 due lines in the outline', { concurrency: false }, () => {
  const x = world();

  it('UX-63 outline due lines: each dated lesson and chapter shows dueOn with <time datetime> in dir=ltr after its title, in the secondary style; no late word or colour for past dates; a locked chapter\'s date the same; undated items unchanged', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    for (const [lang, width] of [['ar', 'phone'], ['en', 'desktop']] as const) {
      const k = await open(browser, w, SALMA, `${subjectPath(s, s.math)}?open=${a.practice}`, { lang, width });
      const page = k.page;
      const lines = await page.$$eval('.due-line', (ls) => ls.map((l) => {
        const time = l.querySelector('time');
        const host = l.closest('li, summary')!;
        const title = host.querySelector('a, bdi.title, .title');
        return {
          text: l.textContent?.trim(), datetime: time?.getAttribute('datetime'), timeText: time?.textContent, dir: time?.closest('[dir]')?.getAttribute('dir'),
          after: title ? Boolean(title.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) : false,
          color: getComputedStyle(l).color,
        };
      }));
      const dated = Object.entries(a.dates).filter(([name, d]) => d && name !== 'L7' && name !== 'G1').length;
      assert.equal(lines.length, dated, `${lang}: one line per dated lesson and chapter (${dated}; the removed L7 is not shown, G1 is Arabic grammar's)`);
      for (const l of lines) {
        assert.equal(l.text, words('school', lang)('dueOn', { date: l.datetime! }), `${lang}: dueOn with the date`);
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(l.timeText ?? '') && l.timeText === l.datetime && l.dir === 'ltr', `${lang}: <time datetime> in Latin digits in dir=ltr`);
        assert.ok(l.after, `${lang}: after its title`);
      }
      assert.equal(new Set(lines.map((l) => l.color)).size, 1, `${lang}: the same colour for past and future dates`);
      assert.equal(lines[0].color, 'rgb(87, 96, 106)', `${lang}: the secondary text style`);
      const text = await page.innerText('main');
      assert.ok(!text.includes(UI[lang].todoOverdue.split('(')[0].trim()), `${lang}: no late word in the outline`);
      await uxShot(page, lang === 'ar' ? 'UX-63-phone-ar' : 'UX-63-desktop-en');
      await k.ctx.close();
    }
    // A locked chapter's date shows the same way (W6-b, Yara Test: K2 is locked).
    const nile = await withW6b(w);
    const doc = await (await (await as(w, YARA6, 'en')).get(subjectPath(nile, nile.subject))).text();
    const lines = dueLinesOf(doc);
    assert.ok(lines.has(nile.K2), 'the locked chapter K2 shows its date');
    assert.ok(lines.has(nile.N3), 'and its lesson N3');
    // Undated items: no line (L6 has no date).
    const salma = await (await (await as(w, SALMA, 'en')).get(subjectPath(s, s.math))).text();
    assert.ok(!dueLinesOf(salma).has(a.L.L6), 'an undated lesson has no line');
  });
});

// ------------------------------------------------------------------- UX-64 ----
describe('UX-64 Arabic, mixed text and kit words for the learner pages (three kits)', { concurrency: false }, () => {
  const x = world();

  it('UX-64 language check by key (three kits), learner pages: lang and dir; titles in <bdi>; dates Latin YYYY-MM-DD in dir=ltr; no value of the other language in the block or the due lines; the kit words', async () => {
    const { w, browser } = x;
    for (const sp of [w.company, w.university]) {
      await w.p.sql(`UPDATE lesson SET due_on = '${dPlus(0)}' WHERE id = '${sp.lessons['Adding fractions']}'`);
      await w.p.sql(`UPDATE chapter SET due_on = '${dPlus(2)}' WHERE id = '${sp.chapters.Percent}'`);
    }
    const longest = (lang: Lang) => LEARNER_KEYS.map((k) => [k, UI[lang][k].split(/{[^}]*}/).map((p) => p.trim()).sort((p, q) => q.length - p.length)[0]] as const).filter(([, v]) => v.length >= 3);
    for (const lang of ['ar', 'en'] as const) {
      for (const sp of [w.school, w.company, w.university]) {
        for (const [where, path] of [['home', home(sp)], ['subject', subjectPath(sp, sp.math)]] as const) {
          const k = await open(browser, w, SALMA, path, { lang });
          const page = k.page;
          assert.deepEqual(await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir })), { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' }, `${sp.kit} ${where} ${lang}: lang and dir`);
          const scope = where === 'home' ? '#todo' : 'main';
          if (where === 'home') {
            assert.ok(await page.$$eval('#todo .todo-link', (as) => as.length > 0 && as.every((a) => Boolean(a.querySelector('bdi')))), `${sp.kit} ${lang}: item titles in <bdi>`);
            assert.ok(await page.$$eval('#todo .todo-line', (ps) => ps.every((p) => Boolean(p.querySelector('bdi:not([dir])')))), `${sp.kit} ${lang}: subject titles in <bdi>`);
            const kinds = await page.$$eval('#todo .todo-line', (ps) => ps.map((p) => p.textContent!.split('·')[0].trim()));
            for (const kind of kinds) assert.ok([words(sp.kit, lang)('lesson'), words(sp.kit, lang)('chapter')].includes(kind), `${sp.kit} ${lang}: the kit's word (${kind})`);
          }
          const dates = await page.$$eval(`${scope} .due-date time`, (ts) => ts.map((t) => ({ text: t.textContent, dir: t.closest('[dir]')?.getAttribute('dir') })));
          assert.ok(dates.length > 0, `${sp.kit} ${where} ${lang}: dated items`);
          for (const d of dates) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d.text ?? '') && d.dir === 'ltr', `${sp.kit} ${where} ${lang}: Latin YYYY-MM-DD in dir=ltr (${JSON.stringify(d)})`);
          const text = where === 'home'
            ? await page.innerText('#todo')
            : (await page.$$eval('.due-line', (ls) => ls.map((l) => l.textContent).join('\n')));
          const cleaned = text.replace(/\d{4}-\d{2}-\d{2}/g, ' ').replace(/[^\n·]*(Mathematics|الرياضيات|Fractions|Practice|Decimals|Percent|Review|Empty chapter|Reading|Comparing|Adding|What is|Arabic grammar|النحو)[^\n·]*/g, ' ');
          for (const [key, value] of longest(lang === 'ar' ? 'en' : 'ar')) assert.ok(!cleaned.includes(value), `${sp.kit} ${where} ${lang}: no ${lang === 'ar' ? 'English' : 'Arabic'} ${key} ("${value}")`);
          if (lang === 'ar' && where === 'home' && sp !== w.school) await uxShot(page, `UX-64-phone-ar-${sp.kit}`);
          await k.ctx.close();
        }
      }
    }
  });
});

// ------------------------------------------------------------------- UX-65 ----
describe('UX-65 states table, learner screens', { concurrency: false }, () => {
  const x = world();

  it('UX-65 states table, learner screens: home empty (no block) and success (groups, fold, todoCapped over 10); outline empty (no due lines), error (today\'s 403) and success; preview as the learner, with today\'s refusals', async () => {
    const { w } = x;
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    // Success: the block with groups and a fold (todoCapped over 10 is UX-62's W6-e step).
    const v = todoOf(await (await salma.get(home(s))).text());
    assert.ok(v && v.groups.length === 3 && v.groups[2].more, 'home success: groups and a fold');
    assert.ok(dueLinesOf(await (await salma.get(subjectPath(s, s.math))).text()).size > 0, 'outline success: due lines');
    // Preview: as the learner; refusals as today (a learner may not open the preview).
    const hadeer = await as(w, HADEER, 'en');
    assert.ok(todoOf(await (await hadeer.get(`/s/${s.id}/preview?from=home`)).text()), 'preview home: the block as the learner');
    assert.ok(dueLinesOf(await (await hadeer.get(`/s/${s.id}/preview/learn/${s.math}?from=home`)).text()).size > 0, 'preview subject: the due lines');
    assert.equal((await salma.get(`/s/${s.id}/preview?from=home`)).status, 403, 'preview refused to a learner: today\'s 403');
    // Error: an unreadable subject answers today's 403 (Karim Test, wave 5's W5-a learner, is not assigned Mathematics).
    await withW5a(w);
    assert.equal((await (await as(w, KARIM5, 'en')).get(subjectPath(s, s.math))).status, 403, 'outline error: an unreadable subject, 403');
    // Empty: no dates at all: no block, no due lines, and the preview the same.
    await w.p.sql('UPDATE lesson SET due_on = NULL');
    await w.p.sql('UPDATE chapter SET due_on = NULL');
    const homeDoc = await (await salma.get(home(s))).text();
    assert.equal(todoOf(homeDoc), null, 'home empty: no block');
    assert.ok(!homeDoc.includes(UI.en.todoTitle), 'home empty: no message');
    assert.equal(dueLinesOf(await (await salma.get(subjectPath(s, s.math))).text()).size, 0, 'outline empty: no due lines');
    assert.equal(todoOf(await (await hadeer.get(`/s/${s.id}/preview?from=home`)).text()), null, 'preview empty: as the learner');
  });
});

// ------------------------------------------------------------------- UX-66 ----
describe('UX-66 widths, targets, contrast and keyboard, learner pages', { concurrency: false }, () => {
  const x = world();

  it('UX-66 widths, targets, contrast and keyboard, learner pages: the home block and the outline due lines at 390, 768, 1280 and 320 px with 120-character titles; 44 px links and fold summaries; 4.5:1 text; focus rings; each fold opens with Enter and Space; J3 and J4 by keyboard', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    const LONG = (p: string) => `${p} ${'كسور Fractions '.repeat(10)}`.slice(0, 120);
    await w.p.sql(`UPDATE subject SET title = '${LONG('الرياضيات Mathematics')}' WHERE id = '${s.math}'`);
    await w.p.sql(`UPDATE lesson SET title = '${LONG('درس Lesson')}' WHERE id = '${a.L.L1}'`);
    await w.p.sql(`UPDATE chapter SET title = '${LONG('وحدة Unit')}' WHERE id = '${a.C2}'`);
    const widths: [string, { width: number; height: number }][] = [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]];
    for (const lang of ['ar', 'en'] as const) {
      for (const [name, path] of [['home', home(s)], ['outline', `${subjectPath(s, s.math)}?open=${a.practice}`]] as const) {
        const k = await open(browser, w, SALMA, path, { lang });
        const page = k.page;
        for (const [wname, size] of widths) {
          await page.setViewportSize(size);
          await page.reload();
          const o = await overflow(page);
          assert.ok(o.sideways <= 0, `${name} ${lang} ${wname}: no sideways scroll (${o.sideways})`);
          assert.deepEqual(o.clipped.filter((c) => !/sr-only/.test(c)), [], `${name} ${lang} ${wname}: no clipped text`);
          if (name === 'home' && lang === 'ar' && wname === 'desktop') await uxShot(page, 'UX-66-desktop-ar');
        }
        await page.setViewportSize(WIDTHS.phone);
        await page.reload();
        if (name === 'home') {
          for (const m of await measure(page, '#todo a.todo-link, #todo details > summary')) assert.ok(m.width >= 44 && m.height >= 44, `${lang}: ${m.selector} ${m.width}x${m.height}`);
          for (const m of await measure(page, '#todo > h2, #todo h3, #todo a.todo-link, #todo .todo-line, #todo details > summary')) {
            if (!m.text.trim()) continue;
            assert.ok(m.contrast >= 4.5, `${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
          }
          for (const sel of [`#todo li[data-item="${a.L.L1}"] a.todo-link`, '#todo [data-group="next"] details > summary']) {
            await page.focus(sel);
            await page.keyboard.press('Shift+Tab');
            const f = await tab(page);
            assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${lang}: the focus ring on ${sel} (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
          }
          // Each fold opens with Enter, and with Space.
          for (const key of ['Enter', 'Space']) {
            await page.reload();
            await page.focus('#todo [data-group="next"] details > summary');
            await page.keyboard.press(key);
            assert.equal(await page.$eval('#todo [data-group="next"] details', (d) => (d as HTMLDetailsElement).open), true, `${lang}: the fold opens with ${key}`);
          }
        } else {
          for (const m of await measure(page, '.due-line')) {
            if (!m.text.trim()) continue;
            assert.ok(m.contrast >= 4.5, `${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
          }
        }
        await k.ctx.close();
      }
    }
    // J3 and J4 by keyboard only: Tab to the first to-do link, Enter opens the lesson; then the subject card's link, Enter opens the outline with its due lines.
    const k = await open(browser, w, SALMA, home(s), { lang: 'ar' });
    const page = k.page;
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.classList.contains('todo-link') ?? false);
    }
    assert.ok(reached, 'J3: a to-do link is reached by Tab (no trap before it)');
    const href = await page.evaluate(() => (document.activeElement as HTMLAnchorElement).getAttribute('href'));
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    assert.equal(new URL(page.url()).pathname, href, 'J3: Enter opens the item');
    await go(page, w, home(s));
    reached = false;
    for (let i = 0; i < 120 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate((m) => (document.activeElement as HTMLAnchorElement | null)?.getAttribute('href')?.endsWith(`/learn/${m}`) ?? false, s.math);
    }
    assert.ok(reached, 'J4: the subject\'s link is reached by Tab');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    assert.ok((await page.$$('.due-line')).length > 0, 'J4: the outline with its due lines');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-67 ----
describe('UX-67 preview shows the list exactly', { concurrency: false }, () => {
  const x = world();

  it('UX-67 preview to-do equals learner: Hadeer\'s preview home block and preview subject due lines have Nour Test\'s markup (preview addresses normalised); its links lead to preview addresses; the banner and Back link are wave 3a\'s', async () => {
    const { w, browser } = x;
    const s = w.school;
    const k = await open(browser, w, HADEER, `/s/${s.id}/preview?from=home`, { lang: 'ar' });
    const page = k.page;
    const block = await page.$eval('#todo', (e) => e.outerHTML);
    const hrefs = await page.$$eval('#todo a.todo-link', (as) => as.map((a) => a.getAttribute('href')!));
    assert.ok(hrefs.length > 0 && hrefs.every((h) => h.startsWith(`/s/${s.id}/preview/`)), `the links lead to preview addresses (${hrefs[0]})`);
    assert.ok(await page.$('#preview-banner') && await page.$('#preview-back'), 'wave 3a\'s banner and Back link');
    await uxShot(page, 'UX-67-phone-ar');
    const n = await open(browser, w, NOUR6, home(s), { lang: 'ar' });
    const learner = await n.page.$eval('#todo', (e) => e.outerHTML);
    assert.equal(unpreviewed(block, s.id), learner, 'the preview block has Nour Test\'s markup');
    await go(page, w, `/s/${s.id}/preview/learn/${s.math}?from=home`);
    await go(n.page, w, subjectPath(s, s.math));
    const lines = (p: Page) => p.$$eval('.due-line', (ls) => ls.map((l) => l.outerHTML));
    assert.deepEqual(await lines(page), await lines(n.page), 'the preview subject page\'s due lines have Nour Test\'s markup');
    assert.ok(listed(todoOf(await (await as(w, ADMIN, 'en')).get(`/s/${s.id}/preview?from=home`).then((r) => r.text()))).size > 0, 'Amal\'s preview has a block too');
    await n.ctx.close();
    await k.ctx.close();
  });
});
