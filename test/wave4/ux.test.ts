// LMS wave 4, W4-1a: the UX floor (ux-plan v2 on PIL-238, rev 65dd62f1),
// UX-44, UX-45, UX-46, UX-47 (the locked Next), UX-48, UX-49 and UX-50; W4-1b
// adds UX-47's status lines and re-runs UX-49 and UX-50 with their strings. One describe per item, each its own CI step
// (`UX-<n> ...`, selected with --test-name-pattern), each on a fresh world, in
// Chromium (Playwright), script on unless stated. Screenshots go to
// evidence/ux/ as the ux-plan names them. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { LONG_LESSON, MIXED_TITLE } from '../wave1/pages.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import {
  ADMIN, HADEER, SALMA, as, browserAs, editorPath, go, home, lessonPath, press, previewLesson, setOrder, subjectPath, topicPath, uxShot,
  wave4World, withW4c, words, WIDTHS, UX49_DENY, type Wave1World, type Width,
} from './world.ts';

type Lang = 'ar' | 'en';
const L = (w: Wave1World, title: string, s = w.school) => s.lessons[title];

/** The wave 4 keys of src/i18n/ui.ts (W4-1a, then W4-1b's two status lines). */
const W4_UI_KEYS = [
  'orderStateOn', 'orderStateOff', 'orderExplain', 'orderSwitchOn', 'orderSwitchOff', 'orderNowOn', 'orderNowOff', 'orderAddNote',
  'orderLine', 'lockedTag', 'lockedReason', 'lockedLater', 'lockedCount', 'lockedCountOne', 'goTo',
  'markedOpened', 'markedRelocked',
] as const satisfies readonly UiKey[];

/** WCAG 2 contrast ratio of two CSS colours (rgb() or rgba() strings). */
function ratio(a: string, b: string): number {
  const lum = (s: string) => {
    const [r, g, bl] = (s.match(/[\d.]+/g) ?? []).map(Number);
    const f = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
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

/** The id (or tag and class) of the element with focus. */
const focused = (page: Page) => page.evaluate(() => {
  const e = document.activeElement as HTMLElement | null;
  return e ? e.id || `${e.tagName.toLowerCase()}.${e.className}` : '';
});

/** Whether an element can take focus by Tab or by click (a link, a control, or a tabindex). */
const focusable = (page: Page, selector: string) => page.$$eval(selector, (els) => els.map((e) => {
  const h = e as HTMLElement;
  return h.matches('a[href], button, input, select, textarea, summary') || h.tabIndex >= 0 || Boolean(h.querySelector('a[href], button, input, select, textarea'));
}));

/** A person's browser on a page, at a width and in a language. */
async function open(browser: Browser, w: Wave1World, who: { username: string; password: string }, path: string, opts: { width?: Width; lang?: Lang; script?: boolean } = {}) {
  const tabbed = await browserAs(browser, w, who, { width: opts.width ?? 'phone', lang: opts.lang ?? 'ar', script: opts.script });
  await go(tabbed.page, w, path);
  return tabbed;
}

const kitWords = (kit: 'school' | 'company' | 'university', lang: Lang) => {
  const t = words(kit, lang);
  return { t, low: (k: 'chapter' | 'lesson' | 'learner') => t(k).toLocaleLowerCase(lang) };
};

// ------------------------------------------------------------------- UX-44 ----
describe('UX-44 setting card and change note', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave4World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-44 the card on the editor and the subject admin page: place, texts per state, secondary button, focus after a press (script on and off), stale ?order=, Tab order; the change note only with the setting on, at add and restore', async () => {
    const s = w.school;
    const { t, low } = kitWords('school', 'ar');
    const explainAr = t('orderExplain', { chapter: low('chapter'), lesson: low('lesson'), learner: low('learner') });
    const k = await open(browser, w, HADEER, editorPath(s, s.math));
    const page = k.page;
    // Place: inside the card of Publish and Preview, after the publish state and the publish button, before Preview.
    assert.equal(await inDomOrder(page, ['#publish-state', '#unpublish button, #publish button', '#order-state', '#preview-subject']), 'ok');
    assert.ok(await page.evaluate(() => document.querySelector('#order-state')!.parentElement === document.querySelector('#publish-state')!.parentElement), 'in the same card');
    assert.equal(await page.getAttribute('#order-state', 'tabindex'), '-1');
    // Off: the state as text, the explanation, one button "Switch on".
    assert.equal((await page.innerText('#order-value')).trim(), UI.ar.orderStateOff);
    assert.equal((await page.innerText('#order-state .order-explain')).trim(), explainAr);
    assert.deepEqual(await page.$$eval('#order-state button', (b) => b.map((x) => x.textContent!.trim())), [UI.ar.orderSwitchOn], 'one button');
    assert.equal(await page.$('#order-status'), null, 'no status line without a press');
    // The button is the secondary style (outlined), at least 44 px tall; Publish keeps the primary fill.
    const style = await page.evaluate(() => {
      const cs = (s: string) => getComputedStyle(document.querySelector(s)!);
      const b = cs('#order-state button');
      const p = cs('#unpublish button, #publish button');
      return { bg: b.backgroundColor, border: parseFloat(b.borderTopWidth), borderStyle: b.borderTopStyle, h: document.querySelector('#order-state button')!.getBoundingClientRect().height, publishBg: p.backgroundColor };
    });
    assert.ok(style.border >= 1 && style.borderStyle !== 'none', 'outlined');
    assert.ok(ratio(style.bg, 'rgb(255, 255, 255)') < 1.1, `a light fill (${style.bg})`);
    assert.ok(style.h >= 44, `the button ${style.h} px tall`);
    await uxShot(page, 'UX-44-phone-ar-off');
    // Tab order: the publish button, the order button, Preview.
    await page.focus('#unpublish button, #publish button');
    await tab(page);
    assert.equal(await page.evaluate(() => document.activeElement?.closest('#order-state') !== null && document.activeElement?.tagName), 'BUTTON', 'the order button after the publish button');
    await tab(page);
    assert.equal(await focused(page), 'preview-subject', 'then Preview');
    // The change note is absent with the setting off.
    assert.equal(await page.$('[data-order-note]'), null, 'off: no change note on the editor');
    // The press (script on): the page opens at #order-state, which has focus, with the status line.
    await Promise.all([page.waitForEvent('load'), page.click('#order-state button')]);
    assert.ok(page.url().endsWith('?order=on#order-state'), page.url());
    assert.equal(await focused(page), 'order-state', 'focus on the block');
    assert.equal((await page.innerText('#order-status')).trim(), UI.ar.orderNowOn);
    assert.equal(await page.getAttribute('#order-status', 'role'), 'status');
    assert.equal((await page.innerText('#order-value')).trim(), UI.ar.orderStateOn);
    assert.deepEqual(await page.$$eval('#order-state button', (b) => b.map((x) => x.textContent!.trim())), [UI.ar.orderSwitchOff]);
    const ring = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement!);
      return { w: parseFloat(cs.outlineWidth), style: cs.outlineStyle, color: cs.outlineColor };
    });
    assert.ok(ring.w >= 2 && ring.style !== 'none' && ratio(ring.color, 'rgb(255, 255, 255)') >= 3, `the focus ring on #order-state (${JSON.stringify(ring)})`);
    await uxShot(page, 'UX-44-phone-ar-on');
    // A stale ?order= (says off while on) shows no status line.
    await go(page, w, `${editorPath(s, s.math)}?order=off`);
    assert.equal(await page.$('#order-status'), null, 'a stale ?order= shows none');
    // The change note: directly above each add-lesson button and each restore button; plain text; at least 4.5:1.
    await go(page, w, editorPath(s, s.math));
    const adds = await page.$$eval('form.add-lesson', (fs) => fs.map((f) => {
      const note = f.querySelector('[data-order-note]');
      return Boolean(note && note.nextElementSibling?.tagName === 'BUTTON');
    }));
    assert.ok(adds.length >= 4 && adds.every(Boolean), `the note right above each add-lesson button (${adds})`);
    assert.ok((await focusable(page, '[data-order-note]')).every((x) => !x), 'the note is not a control');
    for (const m of await measure(page, '[data-order-note]')) {
      assert.ok(m.contrast >= 4.5 && m.fontPx >= 14, `note text ${m.contrast.toFixed(2)}:1, ${m.fontPx} px`);
      assert.equal(m.text, UI.ar.orderAddNote.slice(0, 60));
    }
    await page.locator('[data-order-note]').first().scrollIntoViewIfNeeded();
    await uxShot(page, 'UX-44-phone-ar-addnote');
    await go(page, w, `${editorPath(s, s.math)}/removed`);
    const restores = await page.$$eval('form.restore', (fs) => fs.map((f) => f.previousElementSibling?.hasAttribute('data-order-note') ?? false));
    assert.ok(restores.length >= 1 && restores.every(Boolean), `the note right above each restore button (${restores})`);
    // Script off: the press works the same, focus on the block.
    const off = await open(browser, w, HADEER, editorPath(s, s.math), { script: false });
    await Promise.all([off.page.waitForEvent('load'), off.page.click('#order-state button')]);
    assert.ok(off.page.url().endsWith('?order=off#order-state'));
    assert.equal(await focused(off.page), 'order-state', 'script off: focus on the block');
    assert.equal((await off.page.innerText('#order-status')).trim(), UI.ar.orderNowOff);
    // Off again: the pages carry no note.
    await go(off.page, w, editorPath(s, s.math));
    assert.equal(await off.page.$('[data-order-note]'), null, 'off: no note at add');
    await go(off.page, w, `${editorPath(s, s.math)}/removed`);
    assert.equal(await off.page.$('[data-order-note]'), null, 'off: no note at restore');
    await off.ctx.close();
    // English, on.
    await setOrder(w, true);
    const en = await open(browser, w, HADEER, `${editorPath(s, s.math)}?order=on#order-state`, { lang: 'en' });
    assert.equal((await en.page.innerText('#order-value')).trim(), 'Open in order: On');
    assert.equal((await en.page.innerText('#order-status')).trim(), 'Open in order is on.');
    await uxShot(en.page, 'UX-44-phone-en-on');
    await en.ctx.close();
    // The subject admin page: a card of its own after the name form, the value Hadeer set.
    const admin = await open(browser, w, ADMIN, topicPath(s, s.math), { width: 'desktop' });
    assert.ok(await admin.page.evaluate(() => {
      const card = document.querySelector('#order-state')!;
      const name = [...document.querySelectorAll('form')].find((f) => f.getAttribute('action')?.endsWith('/name'));
      return card.classList.contains('card') && Boolean(name) && Boolean(name!.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), 'a card of its own after the subject\'s name form');
    assert.equal((await admin.page.innerText('#order-value')).trim(), UI.ar.orderStateOn, 'the value Hadeer set');
    await uxShot(admin.page, 'UX-44-desktop-ar-admin');
    await Promise.all([admin.page.waitForEvent('load'), admin.page.click('#order-state button')]);
    assert.equal(await focused(admin.page), 'order-state');
    assert.equal((await admin.page.innerText('#order-status')).trim(), UI.ar.orderNowOff);
    await admin.ctx.close();
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-45 ----
describe('UX-45 locked chapters on the outline', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave4World();
    browser = await chromium.launch();
    await setOrder(w, true);
    await setOrder(w, true, { space: w.company });
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  const lockedIds = (w: Wave1World, s = w.school) => [s.chapters.Decimals, s.chapters.Percent, s.chapters.Review].map((id) => `chapter-${id}`);

  it('UX-45 the order box outside the folds, Go to, tag and reason inside each locked summary, data-locked only on locked chapters, locked lessons plain and not focusable, contrast, nothing new with the setting off', async () => {
    const s = w.school;
    for (const [width, lang, kit] of [['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company']] as const) {
      const space = kit === 'company' ? w.company : s;
      const k = await open(browser, w, SALMA, subjectPath(space, space.math), { width, lang });
      const page = k.page;
      const { t, low } = kitWords(kit, lang);
      // The order box: under the title, outside every <details>, with the order line and Go to.
      assert.equal(await inDomOrder(page, ['main h1', '#order-box', 'details']), 'ok', `${width} ${lang} ${kit}: under the title, before the chapters`);
      assert.equal(await page.evaluate(() => document.querySelector('#order-box')!.closest('details')), null, 'outside every fold');
      assert.equal((await page.innerText('#order-line')).trim(), t('orderLine', { chapter: low('chapter'), lesson: low('lesson') }));
      assert.equal(await page.getAttribute('#go-to', 'href'), lessonPath(space, L(w, 'Adding fractions', space)), 'Go to the first not-done lesson');
      const go2 = (await measure(page, '#go-to'))[0];
      assert.ok(go2.height >= 48 && go2.width >= 44, `Go to ${go2.width}x${go2.height}`);
      if (width === 'phone') {
        const full = await page.evaluate(() => { const a = document.querySelector('#go-to')!.getBoundingClientRect(); const p = document.querySelector('#order-box')!.getBoundingClientRect(); return a.width >= p.width - 1; });
        assert.ok(full, 'full width on phone');
      }
      // Locked chapters: exactly Decimals, Percent and Review carry data-locked; each summary has the tag (glyph hidden) and the reason.
      assert.deepEqual(await page.$$eval('details[data-locked]', (ds) => ds.map((d) => d.id)), lockedIds(w, space));
      for (const id of lockedIds(w, space)) {
        const sum = await page.evaluate((i) => {
          const summary = document.querySelector(`#${i} > summary`)!;
          const tag = summary.querySelector('.lock-tag') as HTMLElement | null;
          const reason = summary.querySelector('.lock-reason') as HTMLElement | null;
          const card = getComputedStyle(document.getElementById(i)!).backgroundColor;
          return {
            tag: tag?.innerText.replace(/\s+/g, ' ').trim(), glyphHidden: tag?.querySelector('[aria-hidden="true"]') !== null,
            reason: reason?.innerText.trim() ?? '', border: tag ? getComputedStyle(tag).borderTopColor : '', bg: tag ? getComputedStyle(tag).backgroundColor : '', card,
            interactive: summary.querySelectorAll('a, button, input, select, textarea').length,
          };
        }, id);
        assert.ok(sum.tag?.endsWith(t('lockedTag')) && sum.glyphHidden, `${id}: the tag with a hidden glyph (${sum.tag})`);
        assert.ok(sum.reason.length > 0 && /\d/.test(sum.reason), `${id}: the reason with its count (${sum.reason})`);
        assert.equal(sum.interactive, 0, `${id}: nothing interactive inside the summary`);
        assert.ok(Math.max(ratio(sum.border, sum.card), ratio(sum.bg, sum.card)) >= 3, `${id}: the tag's border or fill at least 3:1 (${sum.border} on ${sum.card})`);
      }
      for (const m of await measure(page, 'details[data-locked] .lock-reason, #order-line, details[data-locked] .lock-tag')) {
        assert.ok(m.contrast >= 4.5 && m.fontPx >= 14, `${m.selector} "${m.text}": ${m.contrast.toFixed(2)}:1, ${m.fontPx} px`);
      }
      // Open chapters and the empty chapter carry nothing new.
      assert.equal(await page.$$eval('details:not([data-locked])', (ds) => ds.filter((d) => d.querySelector('.lock-tag, .lock-reason, .lock-item')).length), 0);
      await uxShot(page, `UX-45-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
      await k.ctx.close();
    }
    // Opened (?open=all): the locked lessons are plain text with the hidden word, not focusable, at least 4.5:1.
    const k = await open(browser, w, SALMA, subjectPath(s, s.math, 'all'));
    const page = k.page;
    const locked = await page.$$eval('.lock-item', (ls) => ls.map((l) => ({ tag: l.tagName, hidden: l.querySelector('.sr-only')?.textContent ?? '', inLocked: Boolean(l.closest('details[data-locked]')) })));
    assert.equal(locked.length, 3, 'one per lesson of the three locked chapters');
    for (const l of locked) assert.ok(l.tag !== 'A' && l.hidden === UI.ar.lockedTag && l.inLocked, JSON.stringify(l));
    assert.ok((await focusable(page, '.lock-item')).every((x) => !x), 'not focusable');
    for (const m of await measure(page, '.lock-item')) assert.ok(m.contrast >= 4.5, `locked lesson ${m.contrast.toFixed(2)}:1`);
    await uxShot(page, 'UX-45-phone-ar-expanded');
    await k.ctx.close();
    // After Fractions is done (English): Decimals opens; Percent and Review stay locked.
    const salma = await as(w, SALMA, 'en');
    for (const title of ['Adding fractions', 'Comparing fractions']) assert.equal((await press(salma, s, L(w, title), 'done')).status, 303);
    const en = await open(browser, w, SALMA, subjectPath(s, s.math), { lang: 'en' });
    assert.deepEqual(await en.page.$$eval('details[data-locked]', (ds) => ds.map((d) => d.id)), lockedIds(w).slice(1));
    assert.equal(await en.page.getAttribute('#go-to', 'href'), lessonPath(s, L(w, 'Reading decimals')));
    await uxShot(en.page, 'UX-45-phone-en-opened');
    // The setting off: nothing new on the outline.
    await setOrder(w, false);
    await go(en.page, w, subjectPath(s, s.math, 'all'));
    assert.equal(await en.page.$$eval('#order-box, [data-locked], .lock-tag, .lock-reason, .lock-item, #go-to', (x) => x.length), 0, 'off: nothing new');
    await en.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-46 ----
describe('UX-46 locked lesson page', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave4World();
    browser = await chromium.launch();
    await setOrder(w, true);
    await setOrder(w, true, { space: w.company });
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  const ORDER = ['#trail', 'h1#lesson-title', '#lock-tag', '#lock-reason', '#go-to', '#back-to-outline'];
  const ABSENT = '#items, #done-state, #done-control, #lesson-nav, a.go.next, a.go.prev, #next-locked, .way-on';

  async function check(page: Page, w: Wave1World, space: Wave1World['school'], title: string, chapter: string, label: string) {
    assert.equal(await inDomOrder(page, ORDER), 'ok', `${label}: the DOM order`);
    assert.equal(await page.$$eval(ABSENT, (x) => x.length), 0, `${label}: no intro, material, done block, Next or Previous`);
    assert.equal(await page.$$eval('main a.button, main button', (x) => x.length), 1, `${label}: one primary button`);
    assert.equal(await page.getAttribute('#go-to', 'href'), lessonPath(space, L(w, 'Adding fractions', space)));
    const g = (await measure(page, '#go-to'))[0];
    assert.ok(g.height >= 48 && g.width >= 44, `${label}: Go to ${g.width}x${g.height}`);
    assert.ok((await page.getAttribute('#back-to-outline', 'href'))!.includes(space.chapters.Fractions), `${label}: Back to the outline opens the blocking chapter`);
    // The reason is the outline's for the lesson's own chapter.
    const outline = await (await as(w, SALMA, (await page.getAttribute('html', 'lang')) as Lang)).get(subjectPath(space, space.math));
    const html = await outline.text();
    const at = html.indexOf(`id="chapter-${space.chapters[chapter]}"`);
    const summary = html.slice(at, html.indexOf('</summary>', at));
    const outlineReason = /<span class="lock-reason">([\s\S]*?)<\/span>(?=<\/span>)/.exec(summary)?.[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    assert.equal((await page.innerText('#lock-reason')).trim(), outlineReason, `${label}: the reason equals the outline's`);
    assert.equal((await page.innerText('h1#lesson-title')).trim(), title, `${label}: the lesson title`);
    assert.ok(['', 'body.'].includes(await focused(page)), `${label}: a normal page load (no focus move)`);
  }

  it('UX-46 DOM order, absent blocks, sizes, the Go to target and the reason equal to the outline\'s for a lesson in Decimals, Percent and Review', async () => {
    const s = w.school;
    for (const [width, lang, kit] of [['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company']] as const) {
      const space = kit === 'company' ? w.company : s;
      const k = await open(browser, w, SALMA, lessonPath(space, L(w, 'Reading decimals', space)), { width, lang });
      await check(k.page, w, space, 'Reading decimals', 'Decimals', `${width} ${lang} ${kit}`);
      if (width === 'phone') {
        assert.ok(await k.page.evaluate(() => { const a = document.querySelector('#go-to')!.getBoundingClientRect(); return a.width >= document.querySelector('#locked-lesson')!.getBoundingClientRect().width - 1; }), 'full width on phone');
      }
      await uxShot(k.page, `UX-46-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
      await k.ctx.close();
    }
    const en = await open(browser, w, SALMA, lessonPath(s, L(w, 'What is a percent')), { lang: 'en' });
    await check(en.page, w, s, 'What is a percent', 'Percent', 'Percent');
    await uxShot(en.page, 'UX-46-phone-en-later');
    await go(en.page, w, lessonPath(s, L(w, 'Review sheet')));
    await check(en.page, w, s, 'Review sheet', 'Review', 'Review');
    await en.ctx.close();
    // The same page in Amal's preview: the preview banner, preview addresses, no material.
    const pv = await open(browser, w, ADMIN, previewLesson(s, L(w, 'Reading decimals')));
    assert.ok(await pv.page.$('.preview-banner'), 'the preview banner');
    assert.equal(await inDomOrder(pv.page, ORDER), 'ok', 'preview: the DOM order');
    assert.equal(await pv.page.$$eval(ABSENT, (x) => x.length), 0, 'preview: nothing of the lesson');
    assert.ok((await pv.page.getAttribute('#go-to', 'href'))!.includes('/preview/read/'), 'Go to as a preview address');
    await uxShot(pv.page, 'UX-46-phone-ar-preview');
    await pv.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-47 ----
describe('UX-47 lesson end and status lines around a lock', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave4World();
    browser = await chromium.launch();
    await setOrder(w, true);
    const salma = await as(w, SALMA, 'en');
    assert.equal((await press(salma, w.school, L(w, 'Adding fractions'), 'done')).status, 303);
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-47 (W4-1a: the locked Next) Next replaced only when its target is locked, a plain block, not focusable, Tab from the done button straight to Previous', async () => {
    const s = w.school;
    for (const lang of ['ar', 'en'] as const) {
      const { t } = kitWords('school', lang);
      const k = await open(browser, w, SALMA, lessonPath(s, L(w, 'Comparing fractions')), { lang });
      const page = k.page;
      assert.equal(await page.$('a.go.next'), null, `${lang}: no Next link`);
      const block = await page.evaluate(() => {
        const b = document.querySelector('#next-locked') as HTMLElement;
        const cs = getComputedStyle(b);
        return {
          text: b.innerText.replace(/\s+/g, ' ').trim(), border: parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth),
          bg: cs.backgroundColor, tag: b.tagName,
        };
      });
      assert.equal(block.border, 0, 'no border');
      assert.ok(block.bg === 'rgba(0, 0, 0, 0)' || block.bg === 'transparent', `no fill (${block.bg})`);
      assert.ok(block.tag !== 'A' && block.tag !== 'BUTTON');
      assert.ok((await focusable(page, '#next-locked')).every((x) => !x), 'not focusable');
      const reason = t('lockedReason', { title: 'Fractions', count: t('lockedCountOne', { lesson: t('lesson').toLocaleLowerCase(lang) }) });
      if (lang === 'en') assert.equal(reason, 'Opens when Chapter: Fractions is done (1 lesson left).', 'the contract\'s sentence');
      for (const part of [t('nextLesson', { title: 'Reading decimals' }), t('lockedTag'), reason]) assert.ok(block.text.includes(part), `${lang}: "${part}" in "${block.text}"`);
      // Tab: the done button, then Previous.
      await page.focus('#done-control button');
      await tab(page);
      assert.ok(await page.evaluate(() => document.activeElement?.matches('a.go.prev')), `${lang}: Tab goes from the done button straight to Previous (${await focused(page)})`);
      await uxShot(page, `UX-47-phone-${lang}-next-locked`);
      // Next is today's link when its target is open.
      await go(page, w, lessonPath(s, L(w, 'Adding fractions')));
      assert.ok(await page.$('a.go.next'), `${lang}: Next is a link before an open lesson`);
      assert.equal(await page.$('#next-locked'), null);
      await k.ctx.close();
    }
    // With the setting off, the lesson end is today's.
    await setOrder(w, false);
    const k = await open(browser, w, SALMA, lessonPath(s, L(w, 'Comparing fractions')));
    assert.ok(await k.page.$('a.go.next'), 'off: Next is today\'s link');
    assert.equal(await k.page.$('#next-locked'), null);
    await k.ctx.close();
  });

  it('UX-47 (W4-1b: the status lines) after a press that changed what is open, its sentence follows wave 2\'s in the same role="status" element inside #done-state, which takes focus; after "… is open now." Next is today\'s link; no extra sentence when nothing changed', async () => {
    const s = w.school;
    await setOrder(w, true);
    for (const lang of ['ar', 'en'] as const) {
      const { t } = kitWords('school', lang);
      const k = await open(browser, w, SALMA, lessonPath(s, L(w, 'Comparing fractions')), { lang });
      const page = k.page;
      /** Presses the done block's button (a real form post) and reads the status element after the 303. */
      const pressButton = async () => {
        await Promise.all([page.waitForURL(/[?&]marked=/), page.click('#done-control button')]);
        await page.waitForLoadState('load');
        return page.evaluate(() => {
          const st = document.querySelector('#done-status') as HTMLElement | null;
          const extra = document.querySelector('#open-change');
          return {
            text: st?.innerText.replace(/\s+/g, ' ').trim() ?? null, role: st?.getAttribute('role') ?? null,
            inBlock: Boolean(st?.closest('#done-state')), extraInStatus: extra ? Boolean(extra.closest('#done-status')) : null,
            bdi: extra ? [...extra.querySelectorAll('bdi')].map((b) => b.textContent) : [], focus: document.activeElement?.id ?? '',
          };
        });
      };
      // A mark that opened Decimals.
      const opened = await pressButton();
      assert.equal(opened.text, `${t('markedDone')} ${t('markedOpened', { title: 'Decimals' })}`, `${lang}: wave 2's sentence, then "… is open now."`);
      assert.deepEqual([opened.role, opened.inBlock, opened.extraInStatus, opened.focus], ['status', true, true, 'done-state'], `${lang}: one role="status" element inside #done-state, which has focus`);
      assert.ok(opened.bdi.includes('Decimals'), `${lang}: the title in a bdi`);
      assert.ok(await page.$('a.go.next .line2'), `${lang}: Next is today's link with the chapter on its second line`);
      assert.equal(await page.$('#next-locked'), null);
      if (lang === 'ar') await uxShot(page, 'UX-47-phone-ar-opened');
      // The undo locked what was open.
      const relocked = await pressButton();
      assert.equal(relocked.text, `${t('markedNotDone')} ${t('markedRelocked', { title: 'Fractions' })}`, `${lang}: wave 2's sentence, then "… is locked until it is done."`);
      assert.deepEqual([relocked.role, relocked.inBlock, relocked.extraInStatus, relocked.focus], ['status', true, true, 'done-state'], `${lang}: the same element, focused`);
      assert.ok(await page.$('#next-locked'), `${lang}: Next into the locked chapter is the plain block again`);
      if (lang === 'ar') await uxShot(page, 'UX-47-phone-ar-relocked');
      // Nothing changed: un-marking and marking Adding fractions (Decimals stays locked), then a repeated "Mark as done".
      await go(page, w, lessonPath(s, L(w, 'Adding fractions')));
      const undoAdding = await pressButton();
      assert.deepEqual([undoAdding.text, undoAdding.extraInStatus, undoAdding.focus], [t('markedNotDone'), null, 'done-state'], `${lang}: only wave 2's sentence`);
      const markAdding = await pressButton();
      assert.deepEqual([markAdding.text, markAdding.extraInStatus, markAdding.focus], [t('markedDone'), null, 'done-state'], `${lang}: only wave 2's sentence`);
      const again = await press(await as(w, SALMA, lang), s, L(w, 'Adding fractions'), 'done');
      assert.doesNotMatch(again.headers.get('location')!, /opened=|relocked=/, `${lang}: a repeated press flags nothing`);
      await go(page, w, lessonPath(s, L(w, 'Comparing fractions')));
      await go(page, w, again.headers.get('location')!.replace(w.p.url, '').split('#')[0]);
      assert.deepEqual(await page.evaluate(() => [document.querySelector('#done-status')?.textContent?.trim(), document.querySelector('#open-change')]), [t('markedDone'), null], `${lang}: a repeated press, only wave 2's sentence`);
      await k.ctx.close();
    }
  });
});

// ------------------------------------------------------------------- UX-48 ----
describe('UX-48 home actions lead to open lessons', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave4World();
    browser = await chromium.launch();
    await withW4c(w);
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-48 W4-c: the continue link and Mathematics\' card lead to Comparing fractions with the setting on, and to What is a percent (wave 2) with it off; no lock tag on the home', async () => {
    const s = w.school;
    const targets = async (page: Page) => page.evaluate((math) => {
      const card = [...document.querySelectorAll('li.card')].find((li) => li.querySelector(`a[href$="/learn/${math}"]`));
      return { cont: document.querySelector('#continue-link')?.getAttribute('href') ?? null, card: card?.querySelector('a.button.start')?.getAttribute('href') ?? null };
    }, s.math);
    const k = await open(browser, w, SALMA, home(s));
    assert.deepEqual(await targets(k.page), { cont: lessonPath(s, L(w, 'What is a percent')), card: lessonPath(s, L(w, 'What is a percent')) }, 'off: wave 2\'s target');
    await setOrder(w, true);
    await go(k.page, w, home(s));
    const want = lessonPath(s, L(w, 'Comparing fractions'));
    assert.deepEqual(await targets(k.page), { cont: want, card: want }, 'on: the first not-done lesson in reading order');
    assert.equal(await k.page.$$eval('.lock-tag, [data-locked], #order-box, #go-to', (x) => x.length), 0, 'no lock tag on the home');
    assert.equal((await k.page.goto(w.p.url + want))?.status(), 200);
    assert.equal(await k.page.$('#locked-lesson'), null, 'the target is open');
    await go(k.page, w, home(s));
    await uxShot(k.page, 'UX-48-phone-ar-continue');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-49 ----
// LMS wave 7 (UX-77): the list moved, unchanged, to ./world.ts so that wave 7 imports the same one.
const DENY = UX49_DENY;
const NEIGHBOURS = ['أيّ', 'قبل', 'بعد', 'من', 'إلى', 'إكمال', 'إضافة'];
const KIT_PLACEHOLDERS = ['chapter', 'lesson', 'lessonPlural', 'learner'];
const noMarks = (s: string) => s.replace(/[ً-ْ]/g, '');

describe('UX-49 Arabic, mixed text and kit words for chapters in order (three kits)', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave4World();
    browser = await chromium.launch();
    for (const space of [w.school, w.company, w.university]) await setOrder(w, true, { space });
    const salma = await as(w, SALMA, 'en');
    assert.equal((await press(salma, w.school, L(w, 'Adding fractions'), 'done')).status, 303);
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-49 deny list and placeholder neighbours on every wave 4 key; lang and dir, titles in bdi, the language check by key, kit words in three kits', async () => {
    // The deny list (whole words, diacritics ignored).
    for (const key of W4_UI_KEYS) {
      const tokens = noMarks(UI.ar[key]).replace(/{[^}]*}/g, ' ').split(/[\s.,:;()«»"،]+/).filter(Boolean);
      for (const bad of DENY) assert.ok(!tokens.includes(noMarks(bad)), `${key}: no "${bad}"`);
    }
    // The placeholder neighbours: punctuation, the end, or an allowed word.
    for (const key of W4_UI_KEYS) {
      const v = UI.ar[key];
      for (const m of v.matchAll(/{([A-Za-z]+)}/g)) {
        if (!KIT_PLACEHOLDERS.includes(m[1])) continue;
        const beforeText = v.slice(0, m.index).trimEnd();
        const afterText = v.slice(m.index! + m[0].length);
        const prev = /([^\s.,:;()«»"،]+)$/.exec(beforeText)?.[1];
        const next = /^([^\s.,:;()«»"،]+)/.exec(afterText.trimStart())?.[1];
        const punctAfter = afterText.length === 0 || /^[.,:;()«»"،]/.test(afterText);
        assert.ok(prev === undefined || /[.,:;()«»"،]$/.test(beforeText) || NEIGHBOURS.includes(prev), `${key}: the word before {${m[1]}} is "${prev}"`);
        assert.ok(punctAfter || next === undefined || NEIGHBOURS.includes(next), `${key}: the word after {${m[1]}} is "${next}"`);
      }
      // Rendered with three kits' words and two owner-edited labels (one feminine, one masculine): the text outside the placeholders is the same.
      const sets = [
        ...(['school', 'company', 'university'] as const).map((kit) => { const t = words(kit, 'ar'); return { chapter: t('chapter'), lesson: t('lesson'), lessonPlural: t('lessonPlural'), learner: t('learner') }; }),
        { chapter: 'وحدة', lesson: 'حصة', lessonPlural: 'حصص', learner: 'متدربة' },
        { chapter: 'باب', lesson: 'درس', lessonPlural: 'دروس', learner: 'متعلم' },
      ];
      const outside = (set: Record<string, string>) => {
        let text = v;
        for (const p of KIT_PLACEHOLDERS) text = text.split(`{${p}}`).join(`\u0000${set[p]}\u0000`);
        return text.split(/\u0000[^\u0000]*\u0000/).join('|');
      };
      const first = outside(sets[0]);
      for (const set of sets.slice(1)) assert.equal(outside(set), first, `${key}: the same words around every kit word`);
    }
    // Pages: the outline, the locked page and the lesson end in three kits; the editor and the admin page (School).
    const s = w.school;
    const enValues = W4_UI_KEYS.map((k) => [k, UI.en[k].split(/{[^}]*}/).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0]] as const).filter(([, v]) => v.length >= 4);
    const arValues = W4_UI_KEYS.map((k) => [k, UI.ar[k].split(/{[^}]*}/).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0]] as const).filter(([, v]) => v.length >= 3);
    for (const lang of ['ar', 'en'] as const) {
      for (const space of [s, w.company, w.university]) {
        const pages: [string, string, { username: string; password: string }][] = [
          ['outline', subjectPath(space, space.math), SALMA], ['locked lesson', lessonPath(space, L(w, 'Reading decimals', space)), SALMA],
          ...(space === s ? [
            ['lesson end', lessonPath(s, L(w, 'Comparing fractions')), SALMA], ['editor', editorPath(s, s.math), HADEER], ['admin', topicPath(s, s.math), ADMIN],
            // W4-1b: the status line after an undo that locked what follows (Comparing fractions not done, Decimals locked: the flag matches).
            ['relocked status', `${lessonPath(s, L(w, 'Comparing fractions'))}?marked=not-done&relocked=1`, SALMA],
          ] as [string, string, { username: string; password: string }][] : []),
        ];
        for (const [name, path, who] of pages) {
          const k = await open(browser, w, who, path, { lang });
          const page = k.page;
          const attrs = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
          assert.deepEqual(attrs, { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' }, `${space.kit} ${name} ${lang}: lang and dir`);
          // Titles inside the wave 4 sentences are each in their own bdi.
          const titles = await page.$$eval('#go-to, .lock-reason, #next-locked .line1, #open-change', (els) => els.map((e) => ({ text: (e as HTMLElement).innerText, bdi: [...e.querySelectorAll('bdi')].map((b) => b.textContent) })));
          for (const x of titles) {
            if (/Fractions|Adding fractions|Reading decimals|Decimals/.test(x.text)) assert.ok(x.bdi.some((b) => b && /Fractions|Adding fractions|Reading decimals|Decimals/.test(b)), `${space.kit} ${name} ${lang}: the title in a bdi (${x.text})`);
          }
          if (name === 'relocked status') assert.equal(await page.getAttribute('#open-change', 'data-change'), 'relocked', `${lang}: the relocked line is on the page`);
          // The language check by key: no value of the other language as visible text (data, PDF and the space's name allowed).
          const text = (await page.innerText('body')).replace(/Mathematics|Fractions|Adding fractions|Comparing fractions|Reading decimals|What is a percent|Review sheet|Decimals|Percent|Review|PDF/g, ' ');
          for (const [key, value] of lang === 'ar' ? enValues : arValues) assert.ok(!text.includes(value), `${space.kit} ${name} ${lang}: no ${lang === 'ar' ? 'English' : 'Arabic'} ${key} ("${value}")`);
          // The digits the page uses today: Western digits in the count, as wave 2's progress line.
          if (name === 'outline' || name === 'locked lesson') assert.ok(!/[٠-٩]/.test(await page.innerText('main')), `${space.kit} ${name} ${lang}: the page's digits`);
          if (name === 'outline' && lang === 'ar' && space !== s) await uxShot(page, `UX-49-phone-ar-${space.kit}`);
          await k.ctx.close();
        }
      }
      // W4-1b: the status line after a mark that opened Decimals (a real press), then the undo back to the set-up.
      const k = await open(browser, w, SALMA, lessonPath(s, L(w, 'Comparing fractions')), { lang });
      await Promise.all([k.page.waitForURL(/opened=1/), k.page.click('#done-control button')]);
      assert.deepEqual(await k.page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir })), { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' }, `opened status ${lang}: lang and dir`);
      const line = await k.page.$eval('#open-change', (e) => ({ text: (e as HTMLElement).innerText, bdi: [...e.querySelectorAll('bdi')].map((b) => b.textContent) }));
      assert.ok(line.bdi.includes('Decimals'), `opened status ${lang}: the title in a bdi (${line.text})`);
      const text = (await k.page.innerText('body')).replace(/Mathematics|Fractions|Adding fractions|Comparing fractions|Reading decimals|What is a percent|Review sheet|Decimals|Percent|Review|PDF/g, ' ');
      for (const [key, value] of lang === 'ar' ? enValues : arValues) assert.ok(!text.includes(value), `opened status ${lang}: no ${lang === 'ar' ? 'English' : 'Arabic'} ${key} ("${value}")`);
      await Promise.all([k.page.waitForURL(/relocked=1/), k.page.click('#done-control button')]);
      await k.ctx.close();
    }
  });
});

// ------------------------------------------------------------------- UX-50 ----
describe('UX-50 widths, sizes, contrast and keyboard for chapters in order', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  const LONG_CHAPTER = `الكسور Fractions and ratios: ${'قراءة Decimal '.repeat(8)}`.slice(0, 120);
  before(async () => {
    w = await wave4World();
    browser = await chromium.launch();
    const s = w.school;
    // 120-character titles (Arabic with Latin words) inside the reasons and Go to.
    await w.p.sql(`UPDATE chapter SET title = '${LONG_CHAPTER}' WHERE id = '${s.chapters.Fractions}'`);
    await w.p.sql(`UPDATE lesson SET title = '${LONG_LESSON}' WHERE id = '${s.lessons['Adding fractions']}'`);
    await w.p.sql(`UPDATE chapter SET title = '${MIXED_TITLE}' WHERE id = '${s.chapters.Decimals}'`);
    await w.p.sql(`UPDATE lesson SET title = '${MIXED_TITLE}' WHERE id = '${s.lessons['Reading decimals']}'`);
    await setOrder(w, true);
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-50 no sideways scroll or clipped text at 390, 768, 1280 and 320 px; controls at least 44 x 44; text at least 14 px and 4.5:1; focus rings; Tab order on a locked outline', async () => {
    const s = w.school;
    const widths: [string, { width: number; height: number }][] = [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]];
    const pages: [string, string, { username: string; password: string }][] = [
      ['outline', subjectPath(s, s.math, 'all'), SALMA], ['locked lesson', lessonPath(s, L(w, 'Reading decimals')), SALMA],
      ['setting card and change note', editorPath(s, s.math), HADEER], ['admin card', topicPath(s, s.math), ADMIN],
    ];
    // The lesson end with the locked Next: Salma on Comparing fractions (Adding fractions not done), whose Next is Reading decimals.
    pages.push(['lesson end', lessonPath(s, L(w, 'Comparing fractions')), SALMA]);
    // W4-1b: the status line after an undo that locked what follows (no marks: the flag matches), naming the 120-character chapter.
    pages.push(['relocked status', `${lessonPath(s, L(w, 'Comparing fractions'))}?marked=not-done&relocked=1`, SALMA]);
    for (const lang of ['ar', 'en'] as const) {
      for (const [name, path, who] of pages) {
        const k = await open(browser, w, who, path, { lang });
        const page = k.page;
        for (const [wname, size] of widths) {
          await page.setViewportSize(size);
          await page.reload();
          const o = await overflow(page);
          assert.ok(o.sideways <= 0, `${name} ${lang} ${wname}: no sideways scroll (${o.sideways})`);
          const clipped = o.clipped.filter((c) => !/\.sr-only|sr-only:/.test(c));
          assert.deepEqual(clipped, [], `${name} ${lang} ${wname}: no clipped text`);
        }
        await page.setViewportSize(WIDTHS.phone);
        await page.reload();
        // Controls at least 44 x 44; new text at least 14 px and 4.5:1.
        for (const m of await measure(page, '#go-to, #order-state button')) assert.ok(m.width >= 44 && m.height >= 44, `${name} ${lang}: ${m.selector} ${m.width}x${m.height}`);
        if (name === 'relocked status') assert.ok(await page.$('#open-change'), `${lang}: the relocked line is on the page`);
        for (const m of await measure(page, '#order-line, .lock-reason, .lock-tag, .lock-item, #order-value, .order-explain, [data-order-note], #next-locked .line1, #open-change')) {
          assert.ok(m.fontPx >= 14 && m.contrast >= 4.5, `${name} ${lang}: ${m.selector} "${m.text}" ${m.fontPx} px ${m.contrast.toFixed(2)}:1`);
        }
        // Wave 1's focus ring on the new buttons and links.
        for (const sel of ['#go-to', '#order-state button']) {
          if (!(await page.$(sel))) continue;
          await page.focus(sel);
          await page.keyboard.press('Shift+Tab');
          const f = await tab(page);
          assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${name} ${lang}: the focus ring on ${sel} (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
        }
        await k.ctx.close();
      }
      // Tab order on a locked outline (default fold): top navigation, Go to, Expand all / Collapse all, then each chapter summary in order.
      const k = await open(browser, w, SALMA, subjectPath(s, s.math), { lang });
      const stops: { id: string; tag: string; region: string; locked: boolean }[] = [];
      for (let i = 0; i < 30; i++) {
        const f = await tab(k.page);
        const locked = await k.page.evaluate(() => Boolean(document.activeElement?.closest('.lock-item')));
        stops.push({ id: f.id, tag: f.tag, region: f.region, locked });
        if (f.tag === 'body') break;
      }
      const goAt = stops.findIndex((x) => x.id === 'go-to');
      const foldAt = stops.findIndex((x) => x.region === 'fold-all');
      const summaries = stops.map((x, i) => [x, i] as const).filter(([x]) => x.tag === 'summary');
      assert.ok(goAt > 0 && stops.slice(0, goAt).every((x) => x.region === 'top-nav' || x.region === 'chrome'), `${lang}: Go to right after the top navigation (${stops.map((x) => x.id || x.tag).join(' ')})`);
      assert.ok(foldAt > goAt, `${lang}: then Expand all / Collapse all`);
      assert.ok(summaries.length === 5 && summaries[0][1] > foldAt, `${lang}: then each chapter summary (${summaries.length})`);
      assert.ok(stops.every((x) => !x.locked), `${lang}: locked lesson titles are skipped`);
      await k.ctx.close();
    }
    // W4-1b: the status line after a mark that opened the chapter with the mixed title (Fractions done; the flag matches).
    const salma = await as(w, SALMA, 'en');
    for (const title of ['Adding fractions', 'Comparing fractions']) assert.equal((await press(salma, s, L(w, title), 'done')).status, 303);
    for (const lang of ['ar', 'en'] as const) {
      const k = await open(browser, w, SALMA, `${lessonPath(s, L(w, 'Comparing fractions'))}?marked=done&opened=1`, { lang });
      assert.ok(await k.page.$('#open-change'), `${lang}: the opened line is on the page`);
      for (const [wname, size] of widths) {
        await k.page.setViewportSize(size);
        await k.page.reload();
        const o = await overflow(k.page);
        assert.ok(o.sideways <= 0, `opened status ${lang} ${wname}: no sideways scroll (${o.sideways})`);
        assert.deepEqual(o.clipped.filter((c) => !/\.sr-only|sr-only:/.test(c)), [], `opened status ${lang} ${wname}: no clipped text`);
      }
      await k.page.setViewportSize(WIDTHS.phone);
      await k.page.reload();
      for (const m of await measure(k.page, '#open-change')) assert.ok(m.fontPx >= 14 && m.contrast >= 4.5, `opened status ${lang}: "${m.text}" ${m.fontPx} px ${m.contrast.toFixed(2)}:1`);
      await k.ctx.close();
    }
  });
});
