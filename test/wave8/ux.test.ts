// LMS wave 8, W8-1a: the UX floor of the Opening dates page (ux-plan v2 on
// PIL-299, rev 63b571c7): UX-86, UX-87, UX-91 (the page), UX-92 and UX-93
// (the page keys). UX-88 to UX-90 and the learner parts of UX-91 and UX-93
// come with W8-1b. One describe per item, each its own CI step (`UX-<n> ...`,
// selected with --test-name-pattern), each on a fresh world W8-a (Arabic
// first, Open in order on, the clock pinned at 2026-12-09 12:00 UTC), in
// Chromium (Playwright), script on unless stated. Screenshots go to
// evidence/ux/ as the ux-plan names them. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { SEED_KIT_WORDS } from '../../src/kits/seed.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import {
  AMAL, CHAPTERS, HADEER, ID, adminOf, editorOf, openPage, openPost, openRowsOf, openingOf, openingSnapshot, w8World, words8,
  type Kit, type Person, type W8World,
} from './world.ts';

type Lang = 'ar' | 'en';
const WIDTHS = { phone: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 800 } } as const;
type Width = keyof typeof WIDTHS;
const UX_EVIDENCE = fileURLToPath(new URL('../../evidence/ux/', import.meta.url));

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(UX_EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${UX_EVIDENCE}${name}.png`, fullPage: true });
}

/** The page keys of W8-1a (the wording table, less openedOn and openNext, which are W8-1b's). */
const PAGE_KEYS = [
  'openCardTitle', 'openCardHelp', 'openSetLink', 'openPageTitle', 'openOrderNote', 'openOrderCascade', 'openStartedWarn', 'openLabel', 'openBefore',
  'openShowLocked', 'openHide', 'openNone', 'openStateLocked', 'openStateHidden', 'openSince', 'openSave', 'openClear', 'openSaveFor', 'openClearFor',
  'openSaved', 'openCleared', 'openNeedsDate', 'openInvalid', 'openFailed', 'openDueWarn', 'openEmpty',
] as const satisfies readonly UiKey[];

interface Tab { ctx: BrowserContext; page: Page }

/** A fresh browser at a width, signed in through the real form, with the person's language set. */
async function browserAs(browser: Browser, w: W8World, who: Person, opts: { width?: Width; lang?: Lang; script?: boolean } = {}): Promise<Tab> {
  const ctx = await browser.newContext({ viewport: WIDTHS[opts.width ?? 'phone'], locale: 'ar-EG', javaScriptEnabled: opts.script ?? true });
  ctx.setDefaultTimeout(15_000);
  const page = await ctx.newPage();
  await page.goto(w.url + '/signin');
  await page.fill('form#signin input[name=username]', who.username);
  await page.fill('form#signin input[name=password]', who.password);
  await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
  await page.goto(w.url + '/account/language');
  await page.selectOption('form#language select[name=lang]', opts.lang ?? 'ar');
  await Promise.all([page.waitForEvent('load'), page.locator('form#language button[type=submit]').click()]);
  return { ctx, page };
}

async function go(page: Page, w: W8World, path: string): Promise<void> {
  const res = await page.goto(w.url + path);
  assert.equal(res?.status(), 200, `${path} answers 200`);
}

function world(opts: { kit?: Kit } = {}) {
  const box: { w?: W8World; browser?: Browser } = {};
  before(async () => {
    box.w = await w8World({ inOrder: true, kit: opts.kit });
    box.browser = await chromium.launch();
  });
  after(async () => {
    await box.browser?.close();
    await box.w?.close();
  });
  return box as { w: W8World; browser: Browser };
}

const rowSel = (id: string) => `li#chapter-${id}`;

// ------------------------------------------------------------------- UX-86 ----
describe('UX-86 opening page structure, same controls per row, return-to-row', { concurrency: false }, () => {
  const x = world();

  it('UX-86 one tap from the editor card and from the admin\'s subject page', async () => {
    for (const [who, from] of [[AMAL, editorOf()], [HADEER, adminOf()]] as const) {
      const k = await browserAs(x.browser, x.w, who);
      await go(k.page, x.w, from);
      await Promise.all([k.page.waitForEvent('load'), k.page.click('#opening-dates a.due-link')]);
      assert.equal(new URL(k.page.url()).pathname, openPage(from), `${who.username}: one tap`);
      await k.ctx.close();
    }
  });

  it('UX-86 each row: a form, a fieldset with the title as legend, label for the date, the radio group with a visible legend, Save and Clear with their names; the same controls on every row; the lines between the state line and the field', async () => {
    const AR = words8('school', 'ar');
    const k = await browserAs(x.browser, x.w, AMAL);
    await go(k.page, x.w, openPage(editorOf()));
    const rows = await k.page.$$eval('#open-list > li', (lis) => lis.map((li) => {
      const form = li.querySelector(':scope > form');
      const outer = form?.querySelector(':scope > fieldset');
      const legend = outer?.querySelector(':scope > legend');
      const input = outer?.querySelector('input[type=date]') as HTMLInputElement | null;
      const label = input ? outer?.querySelector(`label[for="${input.id}"]`) : null;
      const inner = outer?.querySelector(':scope > fieldset');
      const radios = [...(inner?.querySelectorAll('input[type=radio]') ?? [])] as HTMLInputElement[];
      const buttons = [...(outer?.querySelectorAll('button') ?? [])] as HTMLButtonElement[];
      const state = outer?.querySelector('.due-value');
      const lines = [...(outer?.querySelectorAll('[data-line]') ?? [])];
      const before = (a: Element | null | undefined, b: Element | null | undefined) => Boolean(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        id: li.id, form: Boolean(form), legend: legend?.querySelector('bdi')?.textContent ?? null, label: Boolean(label), labelText: label?.textContent?.trim() ?? '',
        innerLegend: inner?.querySelector(':scope > legend')?.textContent?.trim() ?? null, innerLegendVisible: Boolean(inner?.querySelector(':scope > legend') && (inner.querySelector(':scope > legend') as HTMLElement).offsetHeight > 0),
        radios: radios.map((r) => r.value), names: buttons.map((b) => b.getAttribute('aria-label')), controls: form ? form.querySelectorAll('input:not([type=hidden]), button, select, textarea').length : 0,
        linesBetween: lines.every((l) => before(state, l) && before(l, label)),
        lines: lines.map((l) => l.getAttribute('data-line')),
      };
    }));
    assert.deepEqual(rows.map((r) => r.id), CHAPTERS.map((c) => `chapter-${c.id}`));
    for (const r of rows) {
      const ch = CHAPTERS.find((c) => `chapter-${c.id}` === r.id)!;
      assert.ok(r.form, `${r.id}: a form`);
      assert.equal(r.legend, ch.title, `${r.id}: the fieldset's legend is the title (in <bdi>)`);
      assert.ok(r.label, `${r.id}: <label for> on the date field`);
      assert.equal(r.innerLegend, AR('openBefore'), `${r.id}: the radio group's legend`);
      assert.ok(r.innerLegendVisible, `${r.id}: the legend is visible`);
      assert.deepEqual(r.radios, ['locked', 'hidden']);
      assert.deepEqual(r.names, [AR('openSaveFor', { title: ch.title }), AR('openClearFor', { title: ch.title })], `${r.id}: Save and Clear accessible names`);
      assert.equal(r.controls, rows[0].controls, `${r.id}: the same controls as every row (${r.controls})`);
      assert.ok(r.linesBetween, `${r.id}: the conditional lines sit between the state line and the date field`);
    }
    assert.ok(rows.some((r) => r.lines.length >= 2), 'a row with several lines (Ch2: due and cascade)');
    await k.ctx.close();
  });

  it('UX-86 after a save the page returns to #chapter-<id>, the status in a role=status region inside the row, with focus; screenshots at 390, 768 and 1280 (Arabic)', async () => {
    const AR = words8('school', 'ar');
    const k = await browserAs(x.browser, x.w, AMAL);
    await go(k.page, x.w, openPage(editorOf()));
    await k.page.fill(`#open-${ID.ch4}`, '2026-12-20');
    await Promise.all([k.page.waitForEvent('load'), k.page.click(`${rowSel(ID.ch4)} button[value=save]`)]);
    assert.equal(new URL(k.page.url()).hash, `#chapter-${ID.ch4}`);
    const status = k.page.locator(`${rowSel(ID.ch4)} [role=status]`);
    assert.equal(await status.count(), 1, 'the status region is inside the row');
    assert.equal((await status.innerText()).trim(), AR('openSaved'));
    assert.equal(await k.page.evaluate(() => document.activeElement?.getAttribute('role')), 'status', 'focus on the status');
    assert.deepEqual(openingOf(x.w, ID.ch4), { opens_on: '2026-12-20', opens_hidden: 0 });
    // Back to the evidence state (W8-a): Ch4 without a date, so Ch1 and Ch4 show the started line, Ch2 the due and cascade lines.
    await x.w.as(AMAL).then((c) => c.post(openPost(editorOf(), ID.ch4), { action: 'clear' }));
    for (const width of ['phone', 'tablet', 'desktop'] as const) {
      await k.page.setViewportSize(WIDTHS[width]);
      await go(k.page, x.w, openPage(editorOf()));
      const lines = await k.page.$$eval('[data-line]', (ls) => ls.map((l) => l.getAttribute('data-line')));
      for (const l of ['openStartedWarn', 'openDueWarn', 'openOrderCascade']) assert.ok(lines.includes(l), `${width}: ${l} is visible`);
      await shot(k.page, `UX-86-${width}`);
    }
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-87 ----
describe('UX-87 refused or empty opening date keeps the row', { concurrency: false }, () => {
  const x = world();

  it('UX-87 an empty date: 400, openNeedsDate under the field linked by aria-describedby, aria-invalid and focus on the field, the other rows unchanged; screenshot', async () => {
    const AR = words8('school', 'ar');
    const k = await browserAs(x.browser, x.w, AMAL);
    await go(k.page, x.w, openPage(editorOf()));
    const others = async () => k.page.$$eval('#open-list > li', (lis) => lis.map((li) => [li.id, li.querySelector('.due-value')?.textContent, (li.querySelector('input[type=date]') as HTMLInputElement).value]));
    const before = (await others()).filter(([id]) => id !== `chapter-${ID.ch1}`);
    const snap = openingSnapshot(x.w);
    const [res] = await Promise.all([k.page.waitForResponse((r) => r.request().method() === 'POST'), k.page.click(`${rowSel(ID.ch1)} button[value=save]`)]);
    assert.equal(res.status(), 400);
    await k.page.waitForLoadState('load');
    const field = await k.page.$eval(`#open-${ID.ch1}`, (e) => {
      const input = e as HTMLInputElement;
      const by = input.getAttribute('aria-describedby');
      const err = by ? document.getElementById(by) : null;
      return {
        invalid: input.getAttribute('aria-invalid'), autofocus: input.hasAttribute('autofocus'), focused: document.activeElement === input,
        error: err?.textContent?.trim() ?? null, under: Boolean(err && input.compareDocumentPosition(err) & Node.DOCUMENT_POSITION_FOLLOWING && err.closest('li') === input.closest('li')),
      };
    });
    assert.deepEqual(field, { invalid: 'true', autofocus: true, focused: true, error: AR('openNeedsDate'), under: true });
    assert.deepEqual((await others()).filter(([id]) => id !== `chapter-${ID.ch1}`), before, 'the other rows are unchanged');
    assert.equal(openingSnapshot(x.w), snap, 'nothing stored');
    await shot(k.page, 'UX-87-phone');
    await k.ctx.close();
  });

  it('UX-87 a date out of range from a browser without a date picker: 400, the well-formed value kept, openInvalid; a malformed value is not kept', async () => {
    const AR = words8('school', 'ar');
    const k = await browserAs(x.browser, x.w, AMAL);
    const snap = openingSnapshot(x.w);
    for (const [typed, kept] of [['2026-12-08', '2026-12-08'], ['2029-01-01', '2029-01-01'], ['10/12/2026', '']]) {
      await go(k.page, x.w, openPage(editorOf()));
      // No date picker: a plain text field, no browser check of min and max.
      await k.page.$eval(`#open-${ID.ch2}`, (e, v) => {
        const input = e as HTMLInputElement;
        input.type = 'text';
        input.value = v;
        input.form!.noValidate = true;
      }, typed);
      const [res] = await Promise.all([k.page.waitForResponse((r) => r.request().method() === 'POST'), k.page.click(`${rowSel(ID.ch2)} button[value=save]`)]);
      assert.equal(res.status(), 400, typed);
      await k.page.waitForLoadState('load');
      assert.equal(await k.page.inputValue(`#open-${ID.ch2}`), kept, `${typed}: the field keeps ${kept || 'nothing'}`);
      assert.equal(await k.page.getAttribute(`#open-${ID.ch2}`, 'aria-invalid'), 'true');
      assert.equal((await k.page.locator(`#open-${ID.ch2}-error`).innerText()).trim(), AR('openInvalid', { date: '2028-12-08' }));
      assert.equal(await k.page.evaluate(() => document.activeElement?.id), `open-${ID.ch2}`, 'focus on the field');
    }
    assert.equal(openingSnapshot(x.w), snap, 'nothing stored');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-91 ----
describe('UX-91 rtl, bdi and no horizontal overflow at 390/768/1280', { concurrency: false }, () => {
  const x = world();

  it('UX-91 Arabic: dir=rtl; every date and "00:00", "UTC" isolated left to right; chapter titles in <bdi>', async () => {
    x.w.run('UPDATE chapter SET opens_on = ? WHERE id = ?', '2026-12-01', ID.ch1); // a passed date: "Open since"
    const k = await browserAs(x.browser, x.w, AMAL);
    await go(k.page, x.w, openPage(editorOf()));
    assert.equal(await k.page.getAttribute('html', 'dir'), 'rtl');
    assert.equal(await k.page.getAttribute('html', 'lang'), 'ar');
    const check = await k.page.evaluate(() => {
      const bad: string[] = [];
      const ltr = (e: Element | null) => Boolean(e && e.tagName === 'BDI' && e.getAttribute('dir') === 'ltr');
      for (const t of document.querySelectorAll('main time')) if (!ltr(t.parentElement)) bad.push(`a date not isolated: ${t.textContent}`);
      const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent ?? '';
        if (/\d{2}:\d{2}|UTC|\d{4}-\d{2}-\d{2}/.test(text) && !n.parentElement?.closest('bdi[dir=ltr]') && !n.parentElement?.closest('script, input')) bad.push(`not isolated: ${text.trim().slice(0, 40)}`);
      }
      for (const legend of document.querySelectorAll('#open-list legend.due-title')) if (!legend.querySelector('bdi')) bad.push('a title not in <bdi>');
      for (const label of document.querySelectorAll('#open-list label[for]')) if (!label.querySelector('bdi')) bad.push('a label title not in <bdi>');
      return { bad, dates: document.querySelectorAll('main time').length, times: [...document.querySelectorAll('main bdi[dir=ltr]')].filter((b) => /^(\d{2}:\d{2}|UTC)$/.test(b.textContent ?? '')).length };
    });
    assert.deepEqual(check.bad, []);
    assert.ok(check.dates >= 4, `dates drawn as <time> (${check.dates})`);
    assert.ok(check.times >= 6, `"00:00" and "UTC" isolated in the help and the state lines (${check.times})`);
    x.w.run('UPDATE chapter SET opens_on = NULL WHERE id = ?', ID.ch1);
    await k.ctx.close();
  });

  it('UX-91 no sideways scroll and no clipped text on the page and on each row at 390, 768, 1280 (and 320), Arabic and English, also with 120-character titles', async () => {
    const LONG = (p: string) => `${p} ${'كسور Fractions '.repeat(10)}`.slice(0, 120);
    for (const long of [false, true]) {
      if (long) {
        x.w.run('UPDATE subject SET title = ? WHERE id = ?', LONG('الرياضيات Mathematics'), ID.math);
        x.w.run('UPDATE chapter SET title = ? WHERE id = ?', LONG('وحدة Unit'), ID.ch2);
      }
      for (const lang of ['ar', 'en'] as const) {
        const k = await browserAs(x.browser, x.w, AMAL, { lang });
        await go(k.page, x.w, openPage(editorOf()));
        for (const [wname, size] of [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]] as [string, { width: number; height: number }][]) {
          await k.page.setViewportSize(size);
          await k.page.reload();
          const o = await overflow(k.page);
          assert.ok(o.sideways <= 0, `${lang} ${wname}${long ? ' long' : ''}: no sideways scroll (${o.sideways})`);
          assert.deepEqual(o.clipped, [], `${lang} ${wname}${long ? ' long' : ''}: no clipped text`);
          const rows = await k.page.$$eval('#open-list > li, #open-list > li form, #open-list > li fieldset', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.tagName + (e.id ? '#' + e.id : '')));
          assert.deepEqual(rows, [], `${lang} ${wname}: each row fits (scrollWidth <= clientWidth)`);
        }
        await k.ctx.close();
      }
    }
    x.w.run('UPDATE subject SET title = ? WHERE id = ?', 'Mathematics', ID.math);
    x.w.run('UPDATE chapter SET title = ? WHERE id = ?', 'Fractions', ID.ch2);
  });
});

// ------------------------------------------------------------------- UX-92 ----
describe('UX-92 tab order, 44px targets, contrast of new text', { concurrency: false }, () => {
  const x = world();

  it('UX-92 inside a row: date, then the first radio, the arrow keys to the second, then Save, then Clear date', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const k = await browserAs(x.browser, x.w, AMAL, { lang });
      await go(k.page, x.w, openPage(editorOf()));
      const row = rowSel(ID.ch1);
      await k.page.focus(`#open-${ID.ch1}`);
      const seen: string[] = ['date'];
      const where = () => k.page.evaluate(() => {
        const e = document.activeElement as HTMLInputElement | HTMLButtonElement | null;
        if (!e) return 'none';
        if (e.tagName === 'INPUT') return (e as HTMLInputElement).type === 'date' ? 'date' : `radio:${(e as HTMLInputElement).value}:${(e as HTMLInputElement).checked}`;
        return e.tagName === 'BUTTON' ? `button:${(e as HTMLButtonElement).value}` : e.tagName;
      });
      // A native date field may stop Tab once per part (day, month, year): repeats count once.
      for (let i = 0; i < 8 && !seen.includes('radio:locked:true'); i++) {
        await k.page.keyboard.press('Tab');
        const at = await where();
        if (at !== seen.at(-1)) seen.push(at);
      }
      assert.deepEqual(seen, ['date', 'radio:locked:true'], `${lang}: date, then the first radio`);
      await k.page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight');
      assert.equal(await where(), 'radio:hidden:true', `${lang}: the arrow key moves to the second radio`);
      await k.page.keyboard.press('Tab');
      assert.equal(await where(), 'button:save', `${lang}: then Save`);
      await k.page.keyboard.press('Tab');
      assert.equal(await where(), 'button:clear', `${lang}: then Clear date`);
      assert.ok(await k.page.evaluate((r) => document.activeElement?.closest('li') === document.querySelector(r), row), 'all inside the row');
      await k.ctx.close();
    }
  });

  it('UX-92 every control at least 44 x 44 px at 390 px; the focus ring visible on each; the new text at 4.5:1', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const k = await browserAs(x.browser, x.w, AMAL, { lang });
      await go(k.page, x.w, editorOf());
      for (const m of await measure(k.page, '#opening-dates a.due-link')) assert.ok(m.width >= 44 && m.height >= 44, `${lang} card link ${m.width}x${m.height}`);
      await go(k.page, x.w, openPage(editorOf()));
      const controls = '#open-back, #open-list input[type=date], #open-list input[type=radio], #open-list button';
      const all = await measure(k.page, controls);
      assert.ok(all.length >= 1 + CHAPTERS.length * 5, `every control measured (${all.length})`);
      for (const m of all) assert.ok(m.width >= 44 && m.height >= 44, `${lang}: ${m.selector} "${m.text}" ${m.width}x${m.height}`);
      for (const sel of ['#open-back', `#open-${ID.ch2}`, `${rowSel(ID.ch2)} input[value=locked]`, `${rowSel(ID.ch2)} button[value=save]`, `${rowSel(ID.ch2)} button[value=clear]`]) {
        await k.page.focus(sel);
        await k.page.keyboard.press('Shift+Tab');
        const f = await tab(k.page);
        assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${lang}: the focus ring on ${sel} (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
      }
      const texts = '#open-title, #open-back, .due-help, #open-list legend, #open-list .due-value, #open-list [data-line], #open-list label, #open-list .quiz-choice span, #open-list button';
      const measured = await measure(k.page, texts);
      for (const m of measured) {
        if (!m.text.trim()) continue;
        assert.ok(m.contrast >= 4.5, `${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
      }
      assert.ok(measured.some((m) => m.selector.includes('data-line')), 'the warning lines were measured');
      await k.ctx.close();
    }
  });
});

// ------------------------------------------------------------------- UX-93 ----
/** Every key's rendered text on the page, after the presses that show it. */
async function renderedKeys(w: W8World, kit: Kit, lang: Lang): Promise<{ text: string; html: string; missing: string[] }> {
  const t = words8(kit, lang);
  const low = (k: 'chapter' | 'learner') => t(k).toLocaleLowerCase(lang);
  const c = await w.as(AMAL, lang);
  const get = async (path: string) => (await c.get(path)).text();
  w.run('UPDATE chapter SET opens_on = ? WHERE id = ?', '2026-12-01', ID.ch4); // "Open since"
  const pages: string[] = [await get(editorOf()), await get(openPage(editorOf()))];
  await c.post(openPost(editorOf(), ID.ch1), { action: 'save', opens_on: '2026-12-20', before: 'locked' });
  pages.push(await get(`${openPage(editorOf())}?opening=saved&chapter=${ID.ch1}`));
  await c.post(openPost(editorOf(), ID.ch1), { action: 'clear' });
  pages.push(await get(`${openPage(editorOf())}?opening=cleared&chapter=${ID.ch1}`));
  pages.push(await get(`${openPage(editorOf())}?opening=failed&chapter=${ID.ch1}`));
  pages.push(await (await c.post(openPost(editorOf(), ID.ch1), { action: 'save', opens_on: '', before: 'locked' })).text());
  pages.push(await (await c.post(openPost(editorOf(), ID.ch1), { action: 'save', opens_on: '2020-01-01', before: 'locked' })).text());
  // A subject with nothing to date.
  w.run("INSERT OR IGNORE INTO subject (id, space_id, title, publisher_user_id, is_published) VALUES ('w8-subj-empty', ?, 'Empty', ?, 0)", ID.space, AMAL.id);
  pages.push(await get(openPage(editorOf('w8-subj-empty'))));
  w.run('UPDATE chapter SET opens_on = NULL WHERE id = ?', ID.ch4);
  const html = pages.join('\n');
  // The text a person reads, then every accessible name (aria-label) on its own.
  const names = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(' | ');
  const text = `${html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, '')} | ${names}`
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/\s+/g, ' ');
  const title = 'Fractions';
  const expected: Record<string, string> = {
    openCardTitle: t('openCardTitle'), openCardHelp: t('openCardHelp', { chapter: low('chapter'), learner: low('learner') }), openSetLink: t('openSetLink'),
    openPageTitle: t('openPageTitle', { subjectTitle: 'Mathematics' }), openOrderNote: t('openOrderNote', { chapter: low('chapter') }),
    openOrderCascade: t('openOrderCascade', { title }), openStartedWarn: t('openStartedWarn', { learner: low('learner') }), openLabel: t('openLabel', { title }),
    openBefore: t('openBefore'), openShowLocked: t('openShowLocked'), openHide: t('openHide'), openNone: t('openNone'),
    openStateLocked: t('openStateLocked', { date: '2026-12-10' }), openStateHidden: t('openStateHidden', { date: '2026-12-17' }), openSince: t('openSince', { date: '2026-12-01' }),
    openSave: t('openSave'), openClear: t('openClear'), openSaveFor: t('openSaveFor', { title }), openClearFor: t('openClearFor', { title }),
    openSaved: t('openSaved'), openCleared: t('openCleared'), openNeedsDate: t('openNeedsDate'), openInvalid: t('openInvalid', { date: '2028-12-08' }),
    openFailed: t('openFailed'), openDueWarn: t('openDueWarn'), openEmpty: t('openEmpty'),
  };
  const missing = PAGE_KEYS.filter((k) => !text.includes(expected[k].replace(/\s+/g, ' '))).map((k) => `${k}: ${expected[k]}`);
  return { text, html, missing };
}

describe('UX-93 wording in 3 kits x 2 languages', { concurrency: false }, () => {
  for (const kit of ['school', 'company', 'university'] as const) {
    it(`UX-93 ${kit}: every page key renders in English and Arabic with the kit's words and no {placeholder} left`, async () => {
      const w = await w8World({ inOrder: true, kit });
      try {
        for (const lang of ['en', 'ar'] as const) {
          const { text, missing } = await renderedKeys(w, kit, lang);
          assert.deepEqual(missing, [], `${kit} ${lang}: every key is on the pages`);
          assert.ok(!/\{[a-zA-Z]+\}/.test(text), `${kit} ${lang}: no {placeholder} left`);
          if (lang === 'en') {
            const t = words8(kit, 'en');
            for (const k of ['chapter', 'learner'] as const) assert.ok(text.includes(t(k).toLocaleLowerCase('en')), `${kit}: the kit's "${t(k)}" is in the help`);
          }
        }
      } finally {
        await w.close();
      }
    });
  }

  it('UX-93 no English kit word is hard-coded; the Arabic has no kit placeholder and no kit word after «الـ», «لكل» or «لأي»', () => {
    const kitWords = (lang: 'ar' | 'en') => [...new Set(Object.values(SEED_KIT_WORDS).flatMap((k) => ['chapter', 'lesson', 'learner', 'subject'].map((w) => (k[lang] as Record<string, string>)[w]).filter(Boolean)))];
    for (const key of PAGE_KEYS) {
      const en = UI.en[key];
      for (const word of [...kitWords('en'), 'chapter', 'chapters', 'lesson', 'lessons', 'learner', 'learners', 'subject', 'course', 'unit', 'module', 'student', 'employee']) {
        assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(en.replace(/\{[a-zA-Z]+\}/g, '')), `en ${key}: no literal "${word}"`);
      }
      const ar = UI.ar[key];
      for (const m of ar.matchAll(/\{(\w+)\}/g)) assert.ok(['title', 'date', 'subjectTitle'].includes(m[1]), `ar ${key}: no kit placeholder ({${m[1]}})`);
      for (const word of kitWords('ar')) {
        const bare = word.replace(/^ال/, '');
        assert.ok(!new RegExp(`(?:ال|لكل\\s+|لأي\\s+)${bare}`).test(ar), `ar ${key}: no kit word "${word}" after «الـ», «لكل» or «لأي»`);
      }
    }
  });
});

void HADEER;
