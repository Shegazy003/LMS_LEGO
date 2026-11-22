// LMS wave 6, W6-1a: the UX floor of the teacher's side (ux-plan v2 on
// PIL-257, rev 0184610f): UX-59, UX-60, UX-61, and UX-64, UX-65 and UX-66 for
// the due card and the due-dates page. (UX-62, UX-63, UX-67 and the learner
// parts of UX-64 to UX-66 come with W6-1b.) One describe per item, each its own
// CI step (`UX-<n> ...`, selected with --test-name-pattern), each on a fresh
// world with the clock pinned (W6-c), in Chromium (Playwright), script on
// unless stated. Screenshots go to evidence/ux/ as the ux-plan names them.
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { DUE_MAX_DAYS, TODO_AHEAD_DAYS, TODO_MAX_PER_GROUP } from '../../src/due.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import {
  ADMIN, AT, D, HADEER, adminDue, as, browserAs, clockAt, closeWave6, dPlus, dueOf, dueRowsOf, editorPath, go, publisherDue, saveDue, topicPath, uxShot,
  wave6World, words, WIDTHS, type W6a, type Wave1World, type Width,
} from './world.ts';

type Lang = 'ar' | 'en';
const UNIVERSITY_ADMIN = { username: 'nadia.admin', password: 'admin-third-pass' };
const COMPANY_ADMIN = { username: 'basem.admin', password: 'admin-other-pass' };

/** The keys of the due card and the due-dates page (ux-plan UX-64). */
const TEACHER_KEYS = [
  'dueCardTitle', 'dueCardHelp', 'dueSetLink', 'duePageTitle', 'dueLabel', 'dueOn', 'dueNone', 'dueSave', 'dueClear', 'dueSaveFor', 'dueClearFor',
  'dueSaved', 'dueCleared', 'dueInvalid', 'dueChapterEmpty',
] as const satisfies readonly UiKey[];
/** Every wave 6 key (the learner's too, all landed in this task), for the checks on the values themselves. */
// W6-1c (contract v3 G9.4, ux-plan v3 UX-81): the checks run on the guardian's three keys too, and on dueCardHelp's new value.
const ALL_KEYS = [...TEACHER_KEYS, 'todoTitle', 'todoOverdue', 'todoToday', 'todoNext7', 'todoMore', 'todoCapped', 'todoItemLine', 'guardianTodoTitle', 'guardianTodoNote', 'guardianTodoCapped'] as const satisfies readonly UiKey[];

/** Whether every selector is found, in this DOM order. */
const inDomOrder = (page: Page, selectors: string[]) => page.evaluate((sels) => {
  const els = sels.map((s) => document.querySelector(s));
  if (els.some((e) => !e)) return `missing: ${sels.filter((_, i) => !els[i]).join(', ')}`;
  for (let i = 1; i < els.length; i++) {
    if (!(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING)) return `${sels[i - 1]} is not before ${sels[i]}`;
  }
  return 'ok';
}, selectors);

const focused = (page: Page) => page.evaluate(() => {
  const e = document.activeElement as HTMLElement | null;
  return e ? { id: e.id, cls: e.className, row: e.closest('li.due-item')?.id ?? null } : null;
});

async function open(browser: Browser, w: Wave1World, who: { username: string; password: string }, path: string, opts: { width?: Width; lang?: Lang; script?: boolean } = {}) {
  const tabbed = await browserAs(browser, w, who, { width: opts.width ?? 'phone', lang: opts.lang ?? 'ar', script: opts.script });
  await go(tabbed.page, w, path);
  return tabbed;
}

function world() {
  const box: { w?: Wave1World; a?: W6a; browser?: Browser } = {};
  before(async () => {
    ({ w: box.w, a: box.a } = await wave6World());
    box.browser = await chromium.launch();
  });
  after(async () => {
    await box.browser?.close();
    await closeWave6(box.w);
  });
  return box as { w: Wave1World; a: W6a; browser: Browser };
}

// ------------------------------------------------------------------- UX-59 ----
describe('UX-59 due card place, order and labels', { concurrency: false }, () => {
  const x = world();

  it('UX-59 on the editor and the subject admin page the card comes after the announcement card: h2, help line, a secondary 44 px link; no new button', async () => {
    const { w, browser } = x;
    const s = w.school;
    for (const [who, path, due, lang, width, shot] of [
      [HADEER, editorPath(s, s.math), publisherDue(s, s.math), 'ar', 'phone', 'UX-59-phone-ar'],
      [ADMIN, topicPath(s, s.math), adminDue(s, s.math), 'en', 'desktop', 'UX-59-desktop-en-admin'],
    ] as const) {
      const k = await open(browser, w, who, path, { lang, width });
      const page = k.page;
      const t = words('school', lang);
      assert.equal(await inDomOrder(page, ['#announcements', '#due-dates', '#due-dates > h2', '#due-dates .due-help', '#due-dates a.due-link']), 'ok', `${who.username}: after the announcement card, parts in order`);
      if (who === HADEER) assert.equal(await inDomOrder(page, ['#due-dates', '#outline']), 'ok', 'before the outline');
      assert.equal((await page.textContent('#due-dates > h2'))?.trim(), t('dueCardTitle'));
      // W6-1c (G9.4): dueCardHelp's new last sentence also names the guardian, in lower case as the learner.
      const help = t('dueCardHelp', { chapter: t('chapter').toLocaleLowerCase(lang), lesson: t('lesson').toLocaleLowerCase(lang), subject: t('subject').toLocaleLowerCase(lang), learner: t('learner').toLocaleLowerCase(lang), guardian: t('guardian').toLocaleLowerCase(lang), days: String(TODO_AHEAD_DAYS) });
      assert.equal((await page.textContent('#due-dates .due-help'))?.trim(), help, 'the help line, with the ahead days and when a day ends');
      assert.equal((await page.textContent('#due-dates a.due-link'))?.trim(), t('dueSetLink'));
      assert.equal(await page.getAttribute('#due-dates a.due-link', 'href'), due);
      assert.equal(await page.$$eval('#due-dates button, #due-dates form', (b) => b.length), 0, 'the card adds no button and no form (Publish stays the only primary button)');
      const [link] = await measure(page, '#due-dates a.due-link');
      assert.ok(link.width >= 44 && link.height >= 44, `the link is a 44 px target (${link.width}x${link.height})`);
      const style = await page.$eval('#due-dates a.due-link', (a) => ({ bg: getComputedStyle(a).backgroundColor, color: getComputedStyle(a).color }));
      assert.deepEqual(style, { bg: 'rgb(255, 255, 255)', color: 'rgb(11, 61, 145)' }, 'the secondary style (white, blue text), not the primary blue fill');
      await uxShot(page, shot);
      await k.ctx.close();
    }
  });
});

// ------------------------------------------------------------------- UX-60 ----
describe('UX-60 due page rows, labels, min and max, clear only when set', { concurrency: false }, () => {
  const x = world();

  it('UX-60 the heading and back link, one row per chapter then its lessons (indented on the inline-start side, each with its kit word), the field, labels and accessible names, Clear only when set, dueChapterEmpty', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    for (const [who, path, back, lang, width, shot] of [
      [HADEER, publisherDue(s, s.math), editorPath(s, s.math), 'ar', 'phone', 'UX-60-phone-ar'],
      [HADEER, publisherDue(s, s.math), editorPath(s, s.math), 'ar', 'tablet', 'UX-60-tablet-ar'],
      [ADMIN, adminDue(s, s.math), topicPath(s, s.math), 'en', 'desktop', 'UX-60-desktop-en'],
    ] as const) {
      const k = await open(browser, w, who, path, { lang, width });
      const page = k.page;
      const t = words('school', lang);
      assert.equal(await inDomOrder(page, ['#due-back', 'h1#due-title', '#due-list']), 'ok', 'the back link before the list');
      assert.equal(await page.getAttribute('#due-back', 'href'), back, 'back to the editor or the admin page');
      assert.equal((await page.textContent('h1#due-title'))?.trim(), t('duePageTitle', { subjectTitle: 'Mathematics' }));
      const rows = await page.$$eval('li.due-item', (lis) => lis.map((li) => {
        const row = li.querySelector(':scope > .due-row') as HTMLElement;
        const r = row.getBoundingClientRect();
        const input = row.querySelector('input[type=date]') as HTMLInputElement;
        const label = row.querySelector(`label[for="${input.id}"]`) as HTMLElement;
        const time = row.querySelector('.due-value time');
        return {
          id: li.id.slice('item-'.length), kind: row.dataset.kind, kindWord: row.querySelector('.due-kind')?.textContent ?? '', title: row.querySelector('.due-title bdi')?.textContent ?? '',
          left: r.left, right: r.right, label: label?.innerText ?? '', labelBdi: Boolean(label?.querySelector('bdi')), min: input.min, max: input.max, value: input.value, name: input.name,
          save: row.querySelector('.due-form button')?.getAttribute('aria-label') ?? '', clear: row.querySelector('.due-clear button')?.getAttribute('aria-label') ?? null,
          time: time ? { datetime: time.getAttribute('datetime'), dir: time.closest('[dir]')?.getAttribute('dir'), text: time.textContent } : null,
          valueText: (row.querySelector('.due-value') as HTMLElement).innerText.trim(), empty: (row.querySelector('.due-empty') as HTMLElement | null)?.innerText.trim() ?? null,
          emptyColour: row.querySelector('.due-empty') ? getComputedStyle(row.querySelector('.due-empty')!).color : null,
        };
      }));
      const chapters = rows.filter((r) => r.kind === 'chapter');
      const lessons = rows.filter((r) => r.kind === 'lesson');
      assert.ok(chapters.length >= 5 && lessons.length >= 10, `rows (${chapters.length} chapters, ${lessons.length} lessons)`);
      for (const r of rows) {
        assert.equal(r.kindWord, t(r.kind as 'lesson' | 'chapter'), `${r.id}: says its kit word`);
        assert.equal(r.name, 'due_on');
        assert.equal(r.label, t('dueLabel', { title: r.title }), `${r.id}: a visible label with the title`);
        assert.ok(r.labelBdi, 'the title in <bdi> inside the label');
        assert.equal(r.save, t('dueSaveFor', { title: r.title }), `${r.id}: Save's accessible name`);
        const stored = await dueOf(w, r.kind as 'lesson' | 'chapter', r.id);
        assert.equal(r.max, dPlus(DUE_MAX_DAYS));
        assert.equal(r.min, stored !== null && stored < D ? stored : D);
        if (stored) {
          assert.equal(r.clear, t('dueClearFor', { title: r.title }), `${r.id}: Clear's accessible name`);
          assert.deepEqual(r.time, { datetime: stored, dir: 'ltr', text: stored }, `${r.id}: <time datetime> in dir=ltr`);
          assert.equal(r.valueText, t('dueOn', { date: stored }));
          assert.equal(r.value, stored, 'pre-filled');
        } else {
          assert.equal(r.clear, null, `${r.id}: no Clear without a date`);
          assert.equal(r.valueText, t('dueNone'));
        }
      }
      // Lessons are indented on the inline-start side (left in LTR, right in RTL) of their chapter.
      const ch = chapters.find((r) => r.id === a.practice)!;
      for (const l of lessons.filter((r) => r.id.startsWith('w6a-'))) {
        if (lang === 'ar') assert.ok(l.right < ch.right - 8, `RTL: ${l.id} is indented from the right (${l.right} < ${ch.right})`);
        else assert.ok(l.left > ch.left + 8, `LTR: ${l.id} is indented from the left (${l.left} > ${ch.left})`);
      }
      const c3 = rows.find((r) => r.id === a.C3)!;
      assert.equal(c3.empty, t('dueChapterEmpty', { lesson: t('lesson').toLocaleLowerCase(lang) }), 'C3: dueChapterEmpty');
      assert.equal(c3.emptyColour, 'rgb(87, 96, 106)', 'in the secondary text style');
      assert.equal(await page.$$eval('script[src]', (s) => s.length), 0, 'no date picker library');
      await uxShot(page, shot);
      await k.ctx.close();
    }
    // The University kit, English, phone: its kit words on the rows.
    const u = w.university;
    const k = await open(browser, w, UNIVERSITY_ADMIN, adminDue(u, u.math), { lang: 'en', width: 'phone' });
    const kinds = await k.page.$$eval('.due-kind', (e) => [...new Set(e.map((x) => x.textContent))]);
    const uw = words('university', 'en');
    assert.deepEqual(kinds.sort(), [uw('chapter'), uw('lesson')].sort(), 'the University kit words');
    await uxShot(k.page, 'UX-60-phone-en-university');
    await k.ctx.close();
  });

  it('UX-60 without script every form works: save and clear', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    const k = await open(browser, w, ADMIN, adminDue(s, s.math), { lang: 'en', width: 'phone', script: false });
    await k.page.fill(`#due-${a.L.L6}`, dPlus(3));
    await Promise.all([k.page.waitForEvent('load'), k.page.click(`#item-${a.L.L6} .due-form button`)]);
    assert.equal(await dueOf(w, 'lesson', a.L.L6), dPlus(3), 'saved without script');
    await Promise.all([k.page.waitForEvent('load'), k.page.click(`#item-${a.L.L6} .due-clear button`)]);
    assert.equal(await dueOf(w, 'lesson', a.L.L6), null, 'cleared without script');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-61 ----
describe('UX-61 due status, focus and error', { concurrency: false }, () => {
  const x = world();

  it('UX-61 after save and clear the page lands at #item-<id>, the status line (role=status, tabindex=-1) inside that row has focus; a stale address shows none', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    const k = await open(browser, w, HADEER, publisherDue(s, s.math), { lang: 'ar', width: 'phone' });
    const page = k.page;
    await page.fill(`#due-${a.L.L3}`, dPlus(4));
    await Promise.all([page.waitForEvent('load'), page.click(`#item-${a.L.L3} .due-form button`)]);
    assert.equal(new URL(page.url()).hash, `#item-${a.L.L3}`);
    const st = `#item-${a.L.L3} > .due-row > .due-status`;
    assert.equal(await page.getAttribute(st, 'role'), 'status');
    assert.equal(await page.getAttribute(st, 'tabindex'), '-1');
    assert.equal((await page.textContent(st))?.trim(), UI.ar.dueSaved);
    assert.deepEqual(await focused(page), { id: '', cls: 'due-status done', row: `item-${a.L.L3}` }, 'the status line has focus');
    await uxShot(page, 'UX-61-phone-ar');
    await Promise.all([page.waitForEvent('load'), page.click(`#item-${a.L.L3} .due-clear button`)]);
    assert.equal((await page.textContent(st))?.trim(), UI.ar.dueCleared);
    assert.equal((await focused(page))?.row, `item-${a.L.L3}`, 'focus on the cleared row\'s status');
    // A reload of the stale saved address shows no false status.
    await go(page, w, `${publisherDue(s, s.math)}?due=saved&item=${a.L.L3}`);
    assert.equal(await page.$$eval('.due-status', (e) => e.length), 0, 'no false status');
    await k.ctx.close();
  });

  it('UX-61 a refused date: 400, the value in that row, dueInvalid tied by aria-describedby, aria-invalid, focus on the field, other rows unchanged (stale-page path)', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    const k = await browserAs(browser, w, HADEER, { lang: 'ar', width: 'phone' });
    try {
      await clockAt(w, AT.lastSecond);
      await go(k.page, w, publisherDue(s, s.math));
      const before = dueRowsOf(await k.page.content()).filter((r) => r.id !== a.L.L6).map((r) => r.html);
      await k.page.fill(`#due-${a.L.L6}`, D);
      await clockAt(w, AT.nextDay);
      const [res] = await Promise.all([k.page.waitForResponse((r) => r.request().method() === 'POST'), k.page.click(`#item-${a.L.L6} .due-form button`)]);
      assert.equal(res.status(), 400);
      await k.page.waitForLoadState('load');
      const field = `#due-${a.L.L6}`;
      assert.equal(await k.page.inputValue(field), D, 'the value kept');
      assert.equal(await k.page.getAttribute(field, 'aria-invalid'), 'true');
      assert.equal(await k.page.getAttribute(field, 'aria-describedby'), `due-${a.L.L6}-error`);
      assert.equal((await k.page.textContent(`#due-${a.L.L6}-error`))?.trim(), UI.ar.dueInvalid.replace('{date}', '2028-12-10'));
      assert.equal((await focused(k.page))?.id, `due-${a.L.L6}`, 'focus on the field');
      const after = dueRowsOf(await k.page.content()).filter((r) => r.id !== a.L.L6);
      // The other rows' bounds move with the new day; everything else on them is unchanged.
      const bounds = (h: string) => h.replace(/ min="[^"]+" max="[^"]+"/, '');
      assert.deepEqual(after.map((r) => bounds(r.html)), before.map(bounds), 'other rows unchanged');
      await uxShot(k.page, 'UX-61-phone-ar-error');
    } finally {
      await k.ctx.close();
      await clockAt(w, AT.noon);
    }
  });
});

// ------------------------------------------------------------------- UX-64 ----
const DENY = ['أنت', 'لك', 'عليك', 'هذا', 'هذه', 'ذلك', 'تلك', 'توقفت', 'بدأت', 'السابق', 'السابقة', 'التالية', 'الجديد', 'الجديدة'];
/** Words allowed right before or after a kit placeholder, each a noun, particle or adverb that never agrees with it. */
const NEIGHBOURS: Record<string, string> = {
  'لأي': 'particle "for any": invariant', 'أو': 'particle "or"', 'فهرس': 'noun "outline of": the kit word is its genitive', 'فورًا': 'adverb "at once": invariant',
  'لكل': 'particle "for each": invariant', 'قبل': 'preposition "before"', 'إضافة': 'noun "adding": the kit word is its object',
  // W6-1c (UX-81): dueCardHelp's new sentence «… إلا في قائمة {learner}، وفي صفحة {guardian} عند وجود ربط.»
  'قائمة': 'noun "list of": the kit word is its genitive', 'صفحة': 'noun "page of": the kit word is its genitive', 'عند': 'preposition "at, when": invariant',
};
const KIT_PLACEHOLDERS = ['chapter', 'lesson', 'subject', 'learner', 'kind', 'guardian'];
/** Words of the table that end in the letters of an attached pronoun but are not one (empty for this table, ux-plan UX-64). */
const PRONOUN_ALLOW: Record<string, string> = {};
const noMarks = (s: string) => s.replace(/[ً-ْ]/g, '');
const tokensOf = (v: string) => noMarks(v).replace(/{[^}]*}/g, ' ').split(/[\s.,:;()«»"،·؟?]+/).filter(Boolean);

describe('UX-64 Arabic, mixed text and kit words for the card and the page (three kits)', { concurrency: false }, () => {
  const x = world();

  it('UX-64 deny list, pronouns and placeholder neighbours: no second person, imperative, demonstrative or attached pronoun; dueCardHelp, dueChapterEmpty, todoCapped and todoItemLine by name', () => {
    for (const key of ALL_KEYS) {
      const tokens = tokensOf(UI.ar[key]);
      for (const bad of DENY) assert.ok(!tokens.includes(noMarks(bad)), `${key}: no "${bad}"`);
      for (const word of tokens) {
        if (Object.hasOwn(PRONOUN_ALLOW, word) || !/[؀-ۿ]/.test(word) || word.length < 3) continue;
        assert.ok(!/(ه|ها|هم|هن|ك|كم)$/.test(word), `${key}: "${word}" ends in an attached pronoun`);
      }
    }
    for (const key of ALL_KEYS) {
      const v = UI.ar[key];
      for (const m of v.matchAll(/{([A-Za-z]+)}/g)) {
        if (!KIT_PLACEHOLDERS.includes(m[1])) continue;
        const beforeText = v.slice(0, m.index).trimEnd();
        const afterText = v.slice(m.index! + m[0].length);
        const prev = /([^\s.,:;()«»"،·]+)$/.exec(beforeText)?.[1];
        const next = /^([^\s.,:;()«»"،·]+)/.exec(afterText.trimStart())?.[1];
        const punctAfter = afterText.trim().length === 0 || /^\s*[.,:;()«»"،·]/.test(afterText);
        assert.ok(prev === undefined || Object.hasOwn(NEIGHBOURS, prev), `${key}: the word before {${m[1]}} is "${prev}"`);
        assert.ok(punctAfter || next === undefined || Object.hasOwn(NEIGHBOURS, noMarks(next)) || Object.hasOwn(NEIGHBOURS, next), `${key}: the word after {${m[1]}} is "${next}"`);
      }
    }
    for (const [key, ph] of [['dueCardHelp', ['chapter', 'lesson', 'subject', 'learner', 'guardian']], ['dueChapterEmpty', ['lesson']], ['todoCapped', ['subject']], ['todoItemLine', ['kind']]] as const) {
      for (const p of ph) assert.ok(UI.ar[key].includes(`{${p}}`), `${key} carries {${p}} (checked above)`);
    }
  });

  it('UX-64 no spaced slash and no literal constants in values; typed placeholders', () => {
    const constants = [String(TODO_AHEAD_DAYS), String(DUE_MAX_DAYS), String(TODO_MAX_PER_GROUP)];
    for (const key of ALL_KEYS) {
      for (const lang of ['ar', 'en'] as const) {
        const v = UI[lang][key];
        assert.ok(!/\s\/\s/.test(v), `${lang} ${key}: no spaced slash`);
        const numbers = v.replace(/{[^}]*}/g, ' ').match(/\d+/g) ?? [];
        for (const c of constants) assert.ok(!numbers.includes(c), `${lang} ${key}: no literal ${c}`);
        for (const m of v.matchAll(/{([A-Za-z]+)}/g)) assert.ok(['chapter', 'lesson', 'subject', 'learner', 'guardian', 'kind', 'title', 'subjectTitle', 'n', 'days', 'date', 'name'].includes(m[1]), `${lang} ${key}: {${m[1]}} is a typed placeholder`);
      }
      assert.deepEqual([...UI.ar[key].matchAll(/{(\w+)}/g)].map((m) => m[1]).sort(), [...UI.en[key].matchAll(/{(\w+)}/g)].map((m) => m[1]).sort(), `${key}: the same placeholders in both languages`);
    }
  });

  it('UX-64 ahead-days constant range: TODO_AHEAD_DAYS is from 3 to 10', () => {
    assert.ok(TODO_AHEAD_DAYS >= 3 && TODO_AHEAD_DAYS <= 10, `TODO_AHEAD_DAYS = ${TODO_AHEAD_DAYS}`);
  });

  it('UX-64 language check by key (three kits): lang and dir, titles in <bdi>, dates Latin YYYY-MM-DD in dir=ltr, no value of the other language on the card or the page', async () => {
    const { w, browser } = x;
    const s = w.school;
    const people = { school: ADMIN, company: COMPANY_ADMIN, university: UNIVERSITY_ADMIN };
    // A dated item in the Company and University spaces too.
    for (const space of [w.company, w.university]) {
      const c = await as(w, people[space.kit], 'en');
      const ch = String((await w.p.sql(`SELECT id FROM chapter WHERE subject_id = '${space.math}' AND removed_at IS NULL ORDER BY position LIMIT 1`))[0].id);
      await saveDue(c, adminDue(space, space.math), 'chapter', ch, dPlus(2));
    }
    const longest = (v: string) => v.split(/{[^}]*}/).map((p) => p.trim()).sort((p, q) => q.length - p.length)[0];
    const enValues = TEACHER_KEYS.map((k) => [k, longest(UI.en[k])] as const).filter(([, v]) => v.length >= 4);
    const arValues = TEACHER_KEYS.map((k) => [k, longest(UI.ar[k])] as const).filter(([, v]) => v.length >= 3);
    for (const lang of ['ar', 'en'] as const) {
      for (const space of [s, w.company, w.university]) {
        for (const path of [topicPath(space, space.math), adminDue(space, space.math)]) {
          const k = await open(browser, w, people[space.kit], path, { lang });
          const page = k.page;
          assert.deepEqual(await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir })), { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' });
          const scope = path.endsWith('/due') ? 'main' : '#due-dates';
          if (path.endsWith('/due')) {
            assert.ok(await page.$$eval('.due-title', (ps) => ps.every((p) => Boolean(p.querySelector('bdi')))), 'titles in <bdi>');
            const dates = await page.$$eval('.due-value time', (ts) => ts.map((x) => ({ text: x.textContent, dir: x.closest('[dir]')?.getAttribute('dir') })));
            assert.ok(dates.length > 0, `${space.kit}: a dated row`);
            for (const d of dates) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d.text ?? '') && d.dir === 'ltr', `a Latin-digit date in dir=ltr (${JSON.stringify(d)})`);
            const kinds = await page.$$eval('.due-kind', (e) => [...new Set(e.map((x) => x.textContent))]);
            assert.ok(kinds.includes(words(space.kit, lang)('chapter')), `${space.kit} ${lang}: the kit's chapter word (${kinds.join(', ')})`);
          }
          const text = (await page.innerText(scope)).replace(/[^\n]*(Mathematics|الرياضيات|Fractions|Practice|Decimals|Percent|Review|Empty chapter|Forklift|Draft|Reading|Comparing|Adding|What is|Old)[^\n]*/g, ' ');
          for (const [key, value] of lang === 'ar' ? enValues : arValues) assert.ok(!text.includes(value), `${space.kit} ${lang} ${path}: no ${lang === 'ar' ? 'English' : 'Arabic'} ${key} ("${value}")`);
          if (lang === 'ar' && space !== s && path.endsWith('/due')) await uxShot(page, `UX-64-phone-ar-${space.kit}-due`);
          await k.ctx.close();
        }
      }
    }
  });
});

// ------------------------------------------------------------------- UX-65 ----
describe('UX-65 states table', { concurrency: false }, () => {
  const x = world();

  it('UX-65 the card always shown; the page: empty subject, chapter with no lesson, 400 with value kept, failed write, 404, 403, success with focus', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    let amal = await as(w, ADMIN, 'en');
    // An empty subject: the card is shown; its page has the empty-outline sentence and no form.
    const made = await amal.post(`/s/${s.id}/admin/topics`, { title: 'Empty subject test', publisher: '' });
    assert.equal(made.status, 303);
    const empty = made.headers.get('location')!;
    const card = await (await amal.get(empty)).text();
    assert.ok(card.includes('id="due-dates"'), 'due card: always shown (an empty subject too)');
    const page = await (await amal.get(`${empty}/due`)).text();
    assert.ok(page.includes(UI.en.nothingHere), 'due page empty: the editor\'s empty-outline sentence');
    assert.ok(!page.includes('<form class="due-'), 'due page empty: no forms');
    const k = await open(browser, w, ADMIN, `${empty}/due`, { lang: 'ar' });
    await uxShot(k.page, 'UX-65-phone-ar-empty-subject');
    await k.ctx.close();
    // The browser set Amal's own language to Arabic: sign in again in English.
    amal = await as(w, ADMIN, 'en');
    // A chapter with no lesson.
    assert.equal(dueRowsOf(await (await amal.get(adminDue(s, s.math))).text()).find((r) => r.id === a.C3)!.empty, UI.en.dueChapterEmpty.replace('{lesson}', 'lesson'), 'chapter with no lesson: dueChapterEmpty');
    // Error: 400 with value kept.
    const bad = await amal.post(`${adminDue(s, s.math)}/lesson/${a.L.L6}`, { due_on: dPlus(-1) });
    assert.equal(bad.status, 400, 'error: 400');
    assert.equal(dueRowsOf(await bad.text()).find((r) => r.id === a.L.L6)!.field.value, dPlus(-1), 'error: value kept');
    // Failed write: wave 2's line, nothing changed.
    w.p.faults!.set({ before: (sql) => { if (/^\s*UPDATE (lesson|chapter) SET due_on\b/.test(sql)) throw new Error('forced failure'); } });
    let loc: string;
    try {
      loc = await saveDue(amal, adminDue(s, s.math), 'lesson', a.L.L6, dPlus(2));
    } finally {
      w.p.faults!.set({});
    }
    assert.equal(loc, `${adminDue(s, s.math)}?due=failed&item=${a.L.L6}#item-${a.L.L6}`, 'failed write: 303 with ?due=failed');
    assert.equal(await dueOf(w, 'lesson', a.L.L6), null, 'failed write: nothing changed');
    const failed = dueRowsOf(await (await amal.get(loc.split('#')[0])).text()).find((r) => r.id === a.L.L6)!;
    assert.equal(failed.status, UI.en.markFailed, 'failed write: "Not saved. Please try again."');
    // 404 and 403.
    assert.equal((await amal.post(`${adminDue(s, s.math)}/lesson/${a.L.L7}`, { due_on: dPlus(2) })).status, 404, 'removed item: 404');
    assert.equal((await amal.post(`${adminDue(s, s.math)}/lesson/${a.G1}`, { due_on: dPlus(2) })).status, 404, 'foreign item: 404');
    assert.equal((await (await as(w, HADEER, 'en')).get(adminDue(s, s.math))).status, 403, 'not allowed: 403');
    // Success: the row's status.
    const ok = await saveDue(amal, adminDue(s, s.math), 'lesson', a.L.L6, dPlus(2));
    assert.equal(dueRowsOf(await (await amal.get(ok.split('#')[0])).text()).find((r) => r.id === a.L.L6)!.status, UI.en.dueSaved, 'success: the row status');
  });
});

// ------------------------------------------------------------------- UX-66 ----
describe('UX-66 widths, targets, contrast and keyboard', { concurrency: false }, () => {
  const x = world();

  it('UX-66 the due card and the due-dates page: no sideways scroll or clipped text at 390, 768, 1280 and 320 px with 120-character titles; 44 px targets, 4.5:1 text, focus rings', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    const LONG = (p: string) => `${p} ${'كسور Fractions '.repeat(10)}`.slice(0, 120);
    await w.p.sql(`UPDATE subject SET title = '${LONG('الرياضيات Mathematics')}' WHERE id = '${s.math}'`);
    await w.p.sql(`UPDATE lesson SET title = '${LONG('درس Lesson')}' WHERE id = '${a.L.L1}'`);
    await w.p.sql(`UPDATE chapter SET title = '${LONG('وحدة Unit')}' WHERE id = '${a.practice}'`);
    const widths: [string, { width: number; height: number }][] = [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]];
    const pages: [string, string][] = [['card', editorPath(s, s.math)], ['page', publisherDue(s, s.math)]];
    for (const lang of ['ar', 'en'] as const) {
      for (const [name, path] of pages) {
        const k = await open(browser, w, HADEER, path, { lang });
        const page = k.page;
        for (const [wname, size] of widths) {
          await page.setViewportSize(size);
          await page.reload();
          const o = await overflow(page);
          assert.ok(o.sideways <= 0, `${name} ${lang} ${wname}: no sideways scroll (${o.sideways})`);
          assert.deepEqual(o.clipped.filter((c) => !/\.sr-only|sr-only:/.test(c)), [], `${name} ${lang} ${wname}: no clipped text`);
          if (name === 'page' && lang === 'en' && wname === 'tablet') await uxShot(page, 'UX-66-tablet-en');
        }
        await page.setViewportSize(WIDTHS.phone);
        await page.reload();
        const targets = name === 'card' ? '#due-dates a.due-link' : '.due-fields input[type=date], .due-button, #due-back';
        for (const m of await measure(page, targets)) assert.ok(m.width >= 44 && m.height >= 44, `${name} ${lang}: ${m.selector} ${m.width}x${m.height}`);
        const texts = name === 'card' ? '#due-dates > h2, #due-dates .due-help, #due-dates a.due-link' : '.due-title, .due-kind, .due-value, .due-empty, .due-form label, .due-button, #due-back';
        for (const m of await measure(page, texts)) {
          if (!m.text.trim()) continue;
          assert.ok(m.contrast >= 4.5, `${name} ${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
        }
        for (const sel of name === 'card' ? ['#due-dates a.due-link'] : [`#due-${a.L.L6}`, `#item-${a.L.L6} .due-form button`, `#item-${a.L.L1} .due-clear button`, '#due-back']) {
          await page.focus(sel);
          await page.keyboard.press('Shift+Tab');
          const f = await tab(page);
          assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${name} ${lang}: the focus ring on ${sel} (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
        }
        await k.ctx.close();
      }
    }
  });

  it('UX-66 keyboard: J1 and J2 by keyboard only, Tab order follows the DOM, the date field takes typed digits, Enter saves and the status has focus', async () => {
    const { w, a, browser } = x;
    const s = w.school;
    for (const [who, from, lang] of [[HADEER, editorPath(s, s.math), 'ar'], [ADMIN, topicPath(s, s.math), 'en']] as const) {
      const k = await open(browser, w, who, from, { lang });
      const page = k.page;
      let reached = false;
      for (let i = 0; i < 200 && !reached; i++) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate(() => document.activeElement?.classList.contains('due-link') ?? false);
      }
      assert.ok(reached, `${who.username}: the set link is reached by Tab (no trap before it)`);
      await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
      // Tab order on the page follows the DOM: back link, then each row's field, Save, (Clear).
      await page.focus('#due-back');
      const order: string[] = ['due-back'];
      // A native date field stops Tab once per part (day, month, year): repeats of one field count once.
      for (let i = 0; i < 30 && order.length < 9; i++) {
        const f = await tab(page);
        const id = f.id || f.tag;
        if (id !== order.at(-1) || id === 'button') order.push(id);
      }
      const domOrder = await page.$$eval('main a[href], main input:not([type=hidden]), main button', (els) => els.map((e) => e.id || e.tagName.toLowerCase()));
      const start = domOrder.indexOf('due-back');
      assert.deepEqual(order, domOrder.slice(start, start + 9), 'Tab follows the DOM order from the back link');
      // The date field takes typed digits (in the browser's own field order).
      const field = `#due-${a.L.L6}`;
      const target = dPlus(6);
      const [y, m, d] = target.split('-');
      let typed = false;
      // The browsers' locale (ar-EG) orders the parts day, month, year; a fresh page for each order tried.
      for (const seq of [`${d}${m}${y}`, `${m}${d}${y}`, `${y}${m}${d}`]) {
        await page.reload();
        await page.focus(field);
        await page.keyboard.type(seq);
        if ((await page.inputValue(field)) === target) { typed = true; break; }
      }
      assert.ok(typed, `${who.username}: the date field accepts typed digits (${await page.inputValue(field)})`);
      // Tab leaves the field (past its remaining parts) to Save.
      for (let i = 0; i < 3 && (await page.evaluate(() => document.activeElement?.tagName)) === 'INPUT'; i++) await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.closest('.due-form') !== null && document.activeElement?.tagName), 'BUTTON', 'then Save');
      await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
      assert.equal(await dueOf(w, 'lesson', a.L.L6), target, `${who.username}: saved by keyboard`);
      assert.equal((await focused(page))?.row, `item-${a.L.L6}`, 'the status line on the row has focus');
      await k.ctx.close();
    }
  });
});
