// UX-18 to UX-26 (ux-plan v2 on PIL-216, rev d311f26f): the preview's floor,
// in a real browser. Each item is its own CI step (--test-name-pattern
// "^UX-<n> "), and saves only the screenshots the ux-plan names, under
// evidence/ux/ (UX-<n>-<width>-<lang>[-<kit>][-<case>].png). One world for
// every item: the wave 1 world with W-a, the wave 1 long titles in Mesk School
// and lesson activity on there.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { UI } from '../../src/i18n/ui.ts';
import { OWNER } from '../support/seed.ts';
import { MIXED_TITLE, longTitles } from '../wave1/pages.ts';
import { measure, overflow, tab, type Focused } from '../wave1/ux.ts';
import {
  ADMIN, COMPANY_ADMIN, HADEER, RAMI, SALMA, UNIVERSITY_ADMIN, UX_EVIDENCE, activity, browserAs, home, ownerPreview, ownerPreviewResults,
  previewHome, previewLesson, previewResults, previewSubject, uxShot, wave3aWorld, word, type Tab, type Wave3aWorld, type Width,
} from './world.ts';

type Lang = 'ar' | 'en';
type Who = { username: string; password: string };
const LANGS = ['ar', 'en'] as const;
const STANDARD: [Width, Lang, 'school' | 'company'][] = [['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company']];

/** The keys this task adds to src/i18n/ui.ts (UX-26, language check by key). */
const W3A_KEYS = [
  'previewTitlePrefix', 'previewTag', 'previewBanner', 'previewScopeAdmin', 'previewScopePublisher', 'previewScopeOne', 'previewNoNotice',
  'previewScopeOwner', 'previewUnpublished', 'previewInert', 'previewBack', 'previewEnd', 'viewAsLearner',
] as const;

let w: Wave3aWorld;
let browser: Browser;
const tabs = new Map<string, Tab>();

/** The language each person last set: it belongs to the person (My account), not to a browser. */
const langOf = new Map<string, Lang>();

/** One signed-in browser per person, language, width and script setting, reused across items. */
async function open(who: Who, lang: Lang, width: Width | 320 = 'phone', script = true): Promise<Page> {
  const key = `${who.username} ${lang} ${width} ${script}`;
  let t = tabs.get(key);
  if (!t) {
    t = await browserAs(browser, w, who, { lang, width: width === 320 ? 'phone' : width, script });
    if (width === 320) await t.page.setViewportSize({ width: 320, height: 640 });
    tabs.set(key, t);
  } else if (langOf.get(who.username) !== lang) {
    await t.page.goto(w.p.url + '/account/language');
    await t.page.selectOption('form#language select[name=lang]', lang);
    await Promise.all([t.page.waitForEvent('load'), t.page.locator('form#language button[type=submit]').click()]);
  }
  langOf.set(who.username, lang);
  return t.page;
}

async function visit(page: Page, path: string, status = 200): Promise<void> {
  const res = await page.goto(w.p.url + path);
  assert.equal(res?.status(), status, `${path} answers ${status}`);
}

const pathOf = (page: Page) => page.url().slice(w.p.url.length);

/** A screenshot of the visible screen at the bottom of the page (UX-18-phone-ar-bottom). */
async function bottomShot(page: Page, name: string): Promise<void> {
  mkdirSync(UX_EVIDENCE, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.screenshot({ path: `${UX_EVIDENCE}${name}.png` });
}

/** The fixed words of a key's value in one language (the wave 1 UX-16a method). */
function fixedWords(lang: Lang, key: string): string[] {
  const value = (UI[lang] as Record<string, string>)[key];
  return value.split(/\{\w+\}/).map((p) => p.replace(/^[\s:.·!?،]+|[\s:.·!?،]+$/g, '')).filter((p) => (p.match(/\p{L}/gu) ?? []).length >= 3);
}

/** Every Tab stop of the page from a fresh load, until focus leaves the page or comes round again. */
async function stops(page: Page): Promise<Focused[]> {
  const out: Focused[] = [];
  for (let i = 0; i < 120; i++) {
    const f = await tab(page);
    if (f.tag === 'body' || (out.length && f.id === out[0].id && f.text === out[0].text)) break;
    out.push(f);
  }
  return out;
}

/** The preview pages of Mesk School a previewer reaches, with the person and a name. */
function previewPages(): [Who, string, string][] {
  const s = w.school;
  const from = 'home' as const;
  return [
    [ADMIN, 'Amal home', previewHome(s, from)],
    [ADMIN, 'Amal outline', previewSubject(s, s.math, undefined, from)],
    [ADMIN, 'Amal outline all open', previewSubject(s, s.math, 'all', from)],
    [ADMIN, 'Amal first lesson', previewLesson(s, s.lessons['Adding fractions'], from)],
    [ADMIN, 'Amal long-title lesson', previewLesson(s, s.lessons['Comparing fractions'], from)],
    [ADMIN, 'Amal mixed-title lesson', previewLesson(s, s.lessons['Reading decimals'], from)],
    [ADMIN, 'Amal last lesson', previewLesson(s, s.lessons['Review sheet'], from)],
    [ADMIN, 'Amal My results', previewResults(s, from)],
    [HADEER, 'Hadeer home', previewHome(s, from)],
    [HADEER, 'Hadeer Physics outline (unpublished)', previewSubject(s, s.physics, undefined, `subject:${s.physics}`)],
    [HADEER, 'Hadeer Physics lesson (unpublished)', previewLesson(s, physicsLesson, `subject:${s.physics}`)],
    [OWNER, 'owner home', ownerPreview(s)],
    [OWNER, 'owner My results', ownerPreviewResults(s)],
  ];
}

/** The pages that gained an entry link (section 9). */
function entryPages(): [Who, string, string][] {
  const s = w.school;
  return [
    [ADMIN, 'admin home', home(s)],
    [ADMIN, 'admin subject page', `/s/${s.id}/admin/topics/${s.math}`],
    [HADEER, 'publisher home', home(s)],
    [HADEER, 'subject editor', `/s/${s.id}/publish/edit/${s.math}`],
    [HADEER, 'lesson editor', `/s/${s.id}/publish/compose/${s.lessons['Adding fractions']}`],
    [OWNER, 'owner space page', `/owner/spaces/${s.id}`],
  ];
}

let physicsLesson = '';

before(async () => {
  w = await wave3aWorld();
  await longTitles(w, w.school);
  await activity(w, true);
  physicsLesson = String((await w.p.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${w.school.physics}'`))[0].id);
  browser = await chromium.launch();
});

after(async () => {
  for (const t of tabs.values()) await t.ctx.close().catch(() => undefined);
  await browser?.close();
  await w?.close();
});

// ------------------------------------------------------------------ UX-18 ----

interface BannerFacts {
  first: boolean;
  outside: boolean;
  lines: { id: string; text: string; height: number }[];
  height: number;
  lang: string;
  dir: string;
  background: string;
  theme: string;
  frame: string;
  end: { last: boolean; text: string; back: boolean } | null;
}

async function bannerFacts(page: Page): Promise<BannerFacts | null> {
  return page.evaluate(() => {
    const b = document.getElementById('preview-banner');
    if (!b) return null;
    const cs = getComputedStyle(b);
    const header = document.querySelector('.space-header');
    const end = document.getElementById('preview-end');
    const elements = [...document.body.children].filter((e) => !['SCRIPT', 'STYLE'].includes(e.tagName));
    return {
      first: document.body.firstElementChild === b,
      outside: b.parentElement === document.body && !b.closest('main, nav, header, footer, aside'),
      lines: [...b.querySelectorAll('[data-line]')].map((e) => ({
        id: e.querySelector('#preview-back') ? 'back' : e.id || 'sentence',
        text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        height: e.getBoundingClientRect().height,
      })),
      height: b.getBoundingClientRect().height,
      lang: b.getAttribute('lang') ?? '',
      dir: b.getAttribute('dir') ?? '',
      background: cs.backgroundColor,
      theme: header ? getComputedStyle(header).backgroundColor : '',
      frame: `${cs.borderTopWidth} ${cs.borderTopStyle}`,
      end: end ? {
        last: elements[elements.length - 1] === end,
        text: (end.querySelector('p') as HTMLElement | null)?.innerText.trim() ?? '',
        back: Boolean(end.querySelector('a#preview-back-end')),
      } : null,
    };
  });
}

describe('UX-18 preview banner, top and bottom', { concurrency: false }, () => {
  it('UX-18 first on every preview page, in order, framed, never the theme colour, at most 320 px at 390 px, bottom line last; no banner on a 403 or 404', async (t) => {
    const heights: string[] = [];
    for (const lang of LANGS) {
      for (const [who, name, path] of previewPages()) {
        const page = await open(who, lang);
        await visit(page, path);
        const b = await bannerFacts(page);
        assert.ok(b, `${lang} ${name}: the banner`);
        assert.ok(b.first, `${lang} ${name}: the banner is the first thing on the page, before the space's band`);
        assert.ok(b.outside, `${lang} ${name}: outside the learner page's own landmarks`);
        const unpublished = name.includes('unpublished');
        const owner = who === OWNER;
        assert.deepEqual(b.lines.map((l) => l.id), ['preview-tag', 'sentence', 'preview-scope', ...(unpublished ? ['preview-unpublished'] : []), 'preview-reason', 'back'], `${lang} ${name}: the lines in order`);
        assert.equal(b.lines[0].text, word(lang, 'previewTag'), `${lang} ${name}: the text tag`);
        assert.equal(b.lines[1].text, word(lang, 'previewBanner', { learner: word(lang, 'learner') }), `${lang} ${name}: the banner sentence`);
        if (who === HADEER) assert.ok(b.lines[2].text.endsWith(word(lang, 'previewNoNotice')), `${lang} ${name}: "Space notices are not shown here."`);
        if (owner) assert.equal(b.lines[2].text, word(lang, 'previewScopeOwner'), `${lang} ${name}: the owner line`);
        if (unpublished) assert.equal(b.lines[3].text, word(lang, 'previewUnpublished', { learner: word(lang, 'learner'), subject: word(lang, 'subject') }), `${lang} ${name}: the unpublished line`);
        assert.equal(b.lines.at(-2)!.text, word(lang, 'previewInert'), `${lang} ${name}: the reason sentence`);
        assert.equal(b.lines.at(-1)!.text, word(lang, 'previewBack'), `${lang} ${name}: Back`);
        for (const l of b.lines) assert.ok(l.height > 0, `${lang} ${name}: line ${l.id} is shown, not folded away`);
        assert.equal(b.lang, lang, `${lang} ${name}: lang on the banner`);
        assert.equal(b.dir, lang === 'ar' ? 'rtl' : 'ltr', `${lang} ${name}: dir on the banner`);
        assert.ok(b.theme, `${lang} ${name}: the space's band is on the page`);
        assert.notEqual(b.background, b.theme, `${lang} ${name}: the banner's background is not the theme colour`);
        assert.match(b.frame, /^[2-9](\.\d+)?px (dashed|dotted|solid|double)$/, `${lang} ${name}: a visible frame (${b.frame})`);
        heights.push(`${lang} ${name}: ${Math.round(b.height)} px`);
        assert.ok(b.height <= 320, `${lang} ${name}: banner height ${b.height} px is at most 320 px at 390 px`);
        assert.ok(b.end, `${lang} ${name}: the bottom line`);
        assert.ok(b.end.last, `${lang} ${name}: the bottom line comes after the page's content`);
        assert.equal(b.end.text, word(lang, 'previewEnd'), `${lang} ${name}: "End of the preview page."`);
        assert.ok(b.end.back, `${lang} ${name}: Back again in the bottom line`);
      }
      // Errors under a preview address are today's error pages, with no banner.
      const hadeer = await open(HADEER, lang);
      await visit(hadeer, previewSubject(w.school, w.school.arabic, undefined, 'home'), 403);
      assert.equal(await hadeer.locator('#preview-banner, #preview-end').count(), 0, `${lang}: no banner on a 403`);
      const amal = await open(ADMIN, lang);
      await visit(amal, previewLesson(w.school, w.school.lessons['Old decimals'], 'home'), 404);
      assert.equal(await amal.locator('#preview-banner, #preview-end').count(), 0, `${lang}: no banner on a 404`);
    }
    t.diagnostic(`UX-18 banner heights at 390 px: ${heights.join('; ')}`);
  });

  it('UX-18 screenshots: the standard set (preview home), the longest banner and the bottom line', async () => {
    for (const [width, lang, kit] of STANDARD) {
      const page = await open(kit === 'school' ? ADMIN : COMPANY_ADMIN, lang, width);
      await visit(page, previewHome(w[kit], 'home'));
      await uxShot(page, `UX-18-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
    }
    const hadeer = await open(HADEER, 'ar');
    await visit(hadeer, previewSubject(w.school, w.school.physics, undefined, `subject:${w.school.physics}`));
    await hadeer.screenshot({ path: `${UX_EVIDENCE}UX-18-phone-ar-unpublished.png` });
    const amal = await open(ADMIN, 'ar');
    await visit(amal, previewLesson(w.school, w.school.lessons['Adding fractions'], 'home'));
    await bottomShot(amal, 'UX-18-phone-ar-bottom');
  });
});

// ------------------------------------------------------------------ UX-19 ----

// LMS wave 2 (contract on PIL-225, section 11 item 3; ux-plan UX-31): the list gains the done block's control.
const INERT = [['brand', 'a.brand'], ['sign-out', '#signout'], ['my-account', '#nav-account'], ['got-it', '#notice-got-it'], ['done', '#done-control']] as const;

describe('UX-19 inert controls in preview', { concurrency: false }, () => {
  for (const lang of LANGS) {
    it(`UX-19 ${lang}: Sign out, My account, the product name and Got it keep text and place, are focusable, described, and do nothing`, async () => {
      const page = await open(ADMIN, lang);
      const path = previewLesson(w.school, w.school.lessons['Adding fractions'], 'home');
      await visit(page, path);
      assert.equal(await page.locator('#notice-card').count(), 1, 'the notice in its full form (activity on, admin)');
      const reason = await page.locator('#preview-reason').innerText();
      assert.equal(reason.trim(), word(lang, 'previewInert'), 'the reason sentence');
      const sent: string[] = [];
      page.on('request', (r) => sent.push(`${r.method()} ${r.url()}`));
      for (const [kind, sel] of INERT) {
        const el = page.locator(sel);
        assert.equal(await el.count(), 1, `${kind} is on the page`);
        const facts = await el.evaluate((e) => {
          const cs = getComputedStyle(e);
          return {
            tag: e.tagName.toLowerCase(), href: e.hasAttribute('href'), form: Boolean(e.closest('form')) || e.hasAttribute('formaction'),
            disabled: e.getAttribute('aria-disabled'), describedby: e.getAttribute('aria-describedby'), tabindex: e.getAttribute('tabindex'),
            text: (e as HTMLElement).innerText.trim(), decoration: cs.textDecorationLine, outline: cs.outlineStyle,
          };
        });
        const expectedText = { brand: 'appName', 'sign-out': 'signOut', 'my-account': 'myAccount', 'got-it': 'activityGotIt', done: 'markDone' } as const;
        assert.equal(facts.text, word(lang, expectedText[kind]), `${kind}: keeps its text`);
        assert.equal(facts.disabled, 'true', `${kind}: aria-disabled="true"`);
        assert.equal(facts.describedby, 'preview-reason', `${kind}: aria-describedby points at the reason sentence`);
        assert.equal(facts.href, false, `${kind}: no href`);
        assert.equal(facts.form, false, `${kind}: no form action`);
        assert.ok(facts.tag === 'button' || facts.tabindex === '0', `${kind}: a native button or tabindex="0"`);
        assert.equal(facts.decoration, 'none', `${kind}: no underline`);
        assert.equal(facts.outline, 'dashed', `${kind}: a dashed outline (more than colour)`);
        const [m] = await measure(page, sel);
        assert.ok(m.contrast >= 4.5, `${kind}: text contrast ${m.contrast.toFixed(2)} is 4.5:1 or more`);
        // Focus, then click, Enter and Space: nothing is sent and the page does not change.
        const before = await page.evaluate(() => document.body.innerHTML);
        await el.focus();
        assert.ok(await el.evaluate((e) => document.activeElement === e), `${kind}: stays focusable`);
        await el.click({ force: true });
        await el.focus();
        await page.keyboard.press('Enter');
        await el.focus();
        await page.keyboard.press('Space');
        await page.waitForTimeout(100);
        assert.equal(pathOf(page), path, `${kind}: still on the same page`);
        assert.equal(await page.evaluate(() => document.body.innerHTML), before, `${kind}: the page is unchanged`);
      }
      assert.deepEqual(sent, [], 'no request is sent by any inert control');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${UX_EVIDENCE}UX-19-phone-${lang}-notice.png`, fullPage: true });
      page.removeAllListeners('request');
    });
  }
});

// ------------------------------------------------------------------ UX-20 ----

/** Follows one visible preview link that leads to another preview page. */
async function onePageOn(page: Page): Promise<boolean> {
  const here = pathOf(page);
  const i = await page.locator('a[href]').evaluateAll((els, current) => els.findIndex((e) => {
    const h = e.getAttribute('href') ?? '';
    return h.includes('/preview') && !h.endsWith('/logo') && !e.closest('#preview-banner, #preview-end') && h.split('#')[0] !== current && e.getClientRects().length > 0;
  }), here);
  if (i < 0) return false;
  await Promise.all([page.waitForEvent('load'), page.locator('a[href]').nth(i).click()]);
  return true;
}

describe('UX-20 way back from every entry point', { concurrency: false }, () => {
  for (const [lang, script] of [['ar', true], ['en', false]] as const) {
    it(`UX-20 ${lang}, script ${script ? 'on' : 'off'}: Back is the first Tab stop, the bottom Back the last, and both lead to the page of origin`, async () => {
      for (const [who, name, origin] of entryPages()) {
        const page = await open(who, lang, 'phone', script);
        await visit(page, origin);
        const id = name === 'subject editor' ? 'preview-subject' : name === 'lesson editor' ? 'preview' : 'view-as';
        await Promise.all([page.waitForEvent('load'), page.locator(`a#${id}`).click()]);
        assert.equal(await page.locator('#preview-banner').count(), 1, `${name}: the entry opens a preview page`);
        let moved = 0;
        for (let k = 0; k < 3 && (await onePageOn(page)); k++) moved++;
        assert.ok(moved >= (who === OWNER ? 1 : 3), `${name}: moved ${moved} pages inside the preview`);
        // A fresh load of the page reached, then the keyboard only.
        await page.reload();
        const all = await stops(page);
        assert.equal(all[0]?.id, 'preview-back', `${name}: the first Tab stop is Back (found ${all[0]?.tag}#${all[0]?.id})`);
        assert.equal(all.at(-1)?.id, 'preview-back-end', `${name}: the last Tab stop is the bottom Back (found ${all.at(-1)?.tag}#${all.at(-1)?.id})`);
        await page.reload();
        await tab(page);
        await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
        assert.equal(pathOf(page), origin, `${name}: Enter on the top Back leads to the page of origin`);
        // The bottom Back from a page inside the preview.
        await Promise.all([page.waitForEvent('load'), page.locator(`a#${id}`).click()]);
        await onePageOn(page);
        await page.locator('#preview-back-end').focus();
        await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
        assert.equal(pathOf(page), origin, `${name}: the bottom Back leads to the page of origin`);
      }
    });
  }
});

// ------------------------------------------------------------------ UX-21 ----

const stopKey = (f: Focused) => `${f.tag}#${f.id} "${f.text}"`;
/** A stop by element and text: the inert Sign out carries the id its form carries on the learner's page (N4), same text and place. */
const orderKey = (f: Focused) => `${f.tag} "${f.text}"`;

describe('UX-21 keyboard and names in preview', { concurrency: false }, () => {
  for (const lang of LANGS) {
    it(`UX-21 ${lang}: a named region before the top navigation, the title prefix, and after Back the learner's own Tab order with focus rings`, async () => {
      const s = w.school;
      const pairs: [string, string, string][] = [
        ['home', previewHome(s, 'home'), home(s)],
        ['outline', previewSubject(s, s.math, undefined, 'home'), `/s/${s.id}/learn/${s.math}`],
        ['lesson', previewLesson(s, s.lessons['Adding fractions'], 'home'), `/s/${s.id}/read/${s.lessons['Adding fractions']}`],
      ];
      for (const [name, preview, learner] of pairs) {
        const page = await open(ADMIN, lang);
        await visit(page, preview);
        const region = await page.evaluate(() => {
          const b = document.getElementById('preview-banner')!;
          const label = document.getElementById(b.getAttribute('aria-labelledby') ?? '');
          const nav = document.getElementById('top-nav');
          return {
            tag: b.tagName.toLowerCase(), name: label?.textContent?.trim() ?? '',
            beforeNav: Boolean(nav && (b.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING)),
            title: document.title,
          };
        });
        assert.equal(region.tag, 'section', `${name}: the banner is a <section>`);
        assert.equal(region.name, word(lang, 'previewTag'), `${name}: named "${word(lang, 'previewTag')}" through aria-labelledby`);
        assert.ok(region.beforeNav, `${name}: placed before the top navigation landmark`);
        assert.ok(region.title.startsWith(`${word(lang, 'previewTitlePrefix')} · `), `${name}: the title starts with the prefix (${region.title})`);
        const got = await stops(page);
        for (const f of got) {
          assert.ok(f.visible, `${name}: ${stopKey(f)} is visible`);
          assert.ok(f.ringPx >= 2, `${name}: ${stopKey(f)} focus ring ${f.ringPx} px`);
          assert.ok(f.ringContrast >= 3, `${name}: ${stopKey(f)} ring contrast ${f.ringContrast.toFixed(2)}`);
        }
        assert.equal(got[0]?.id, 'preview-back', `${name}: Back first`);
        // The learner's own page, in a fresh browser (the notice in full, as on a first visit).
        const t = await browserAs(browser, w, SALMA, { lang });
        await visit(t.page, learner);
        const want = await stops(t.page);
        await t.ctx.close();
        assert.deepEqual(got.slice(1, -1).map(orderKey), want.map(orderKey),`${name}: after the top Back, exactly the learner page's Tab order`);
      }
    });
  }
});

// ------------------------------------------------------------------ UX-22 ----

describe('UX-22 entry points name the learner and open the preview', { concurrency: false }, () => {
  it('UX-22 each entry is 44 x 44 px or more, names the kit\'s learner, sits where the ux-plan puts it and opens the preview in the same tab', async () => {
    for (const lang of LANGS) {
      const viewAs = (kit: 'school' | 'company') => word(lang, 'viewAsLearner', { learner: word(lang, 'learner', {}, kit) }, kit);
      const cases: [Who, string, string, string, string][] = [
        ...entryPages().map(([who, name, path]) => [who, name, path, name === 'subject editor' ? 'preview-subject' : name === 'lesson editor' ? 'preview' : 'view-as',
          name.includes('editor') ? word(lang, 'preview') : viewAs('school')] as [Who, string, string, string, string]),
        [COMPANY_ADMIN, 'company admin home', home(w.company), 'view-as', viewAs('company')],
      ];
      for (const [who, name, path, id, text] of cases) {
        const page = await open(who, lang);
        await visit(page, path);
        const link = page.locator(`a#${id}`);
        assert.equal(await link.count(), 1, `${lang} ${name}: the entry #${id}`);
        const facts = await link.evaluate((e) => {
          const box = e.getBoundingClientRect();
          const near = (sel: string) => {
            const o = document.querySelector(sel);
            return o ? Math.abs(o.getBoundingClientRect().top - box.top) : -1;
          };
          return {
            width: box.width, height: box.height, top: box.top + window.scrollY, target: e.getAttribute('target'),
            text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), besideResults: near('#admin-results'),
          };
        });
        assert.equal(facts.text, text, `${lang} ${name}: names the learner (${facts.text})`);
        assert.equal(facts.target, null, `${lang} ${name}: opens in the same tab`);
        if (!name.includes('editor')) {
          assert.ok(facts.width >= 44 && facts.height >= 44, `${lang} ${name}: ${facts.width.toFixed(1)} x ${facts.height.toFixed(1)} px`);
          assert.ok(facts.top < 844, `${lang} ${name}: near the top (first phone screen, ${Math.round(facts.top)} px)`);
        }
        if (name.endsWith('admin home')) assert.ok(facts.besideResults >= 0 && facts.besideResults < 60, `${lang} ${name}: beside "all results" (${facts.besideResults} px)`);
        await Promise.all([page.waitForEvent('load'), link.click()]);
        assert.equal(await page.locator('#preview-banner').count(), 1, `${lang} ${name}: opens the preview in the same tab`);
        assert.equal(page.context().pages().length, 1, `${lang} ${name}: no new tab`);
      }
    }
    const shots: [Who, string, Width, string][] = [
      [ADMIN, home(w.school), 'phone', 'UX-22-phone-ar-admin'],
      [ADMIN, home(w.school), 'desktop', 'UX-22-desktop-ar-admin'],
      [ADMIN, `/s/${w.school.id}/admin/topics/${w.school.math}`, 'phone', 'UX-22-phone-ar-topic'],
      [HADEER, home(w.school), 'phone', 'UX-22-phone-ar-publisher'],
      [HADEER, `/s/${w.school.id}/publish/edit/${w.school.math}`, 'phone', 'UX-22-phone-ar-editor'],
      [OWNER, `/owner/spaces/${w.school.id}`, 'phone', 'UX-22-phone-ar-owner'],
    ];
    for (const [who, path, width, name] of shots) {
      const page = await open(who, 'ar', width);
      await visit(page, path);
      await uxShot(page, name);
    }
    const basem = await open(COMPANY_ADMIN, 'en');
    await visit(basem, home(w.company));
    await uxShot(basem, 'UX-22-phone-en-admin-company');
  });
});

// ------------------------------------------------------------------ UX-23 ----

describe('UX-23 preview states', { concurrency: false }, () => {
  it('UX-23 nothing published, My results, unpublished, the owner, and activity on for the admin and the publisher each read clearly', async () => {
    for (const lang of LANGS) {
      // The publisher with no published subject: today's empty home, and the scope line says why.
      const rami = await open(RAMI, lang);
      await visit(rami, previewHome(w.school, 'home'));
      assert.equal((await rami.locator('#nothing-yet').innerText()).trim(), word(lang, 'nothingAssigned'), `${lang}: Rami's preview home is empty`);
      assert.ok((await rami.locator('#preview-scope').innerText()).replace(/\s+/g, ' ').includes(fixedWords(lang, 'previewScopePublisher')[0]), `${lang}: the scope line says each published subject you publish`);
      if (lang === 'ar') await uxShot(rami, 'UX-23-phone-ar-nothing');
      // My results: the empty state.
      const amal = await open(ADMIN, lang);
      await visit(amal, previewResults(w.school, 'home'));
      assert.equal((await amal.locator('#results-none').innerText()).trim(), word(lang, 'resultsNone'), `${lang}: My results shows the empty state`);
      if (lang === 'ar') await uxShot(amal, 'UX-23-phone-ar-results');
      // An unpublished subject: the extra banner line.
      const hadeer = await open(HADEER, lang);
      await visit(hadeer, previewSubject(w.school, w.school.physics, undefined, `subject:${w.school.physics}`));
      assert.equal(await hadeer.locator('#preview-unpublished').count(), 1, `${lang}: the unpublished line`);
      // The owner: the owner line, no notice.
      const owner = await open(OWNER, lang);
      await visit(owner, ownerPreview(w.school));
      assert.equal((await owner.locator('#preview-scope').innerText()).trim(), word(lang, 'previewScopeOwner'), `${lang}: the owner line`);
      assert.equal(await owner.locator('#notice-card, #notice-line').count(), 0, `${lang}: no notice for the owner`);
      await uxShot(owner, `UX-23-phone-${lang}-owner`);
      // Activity on, admin: the full notice with Got it inert.
      await visit(amal, previewHome(w.school, 'home'));
      assert.equal(await amal.locator('#notice-card').count(), 1, `${lang}: the admin sees the notice in full`);
      assert.equal(await amal.locator('#notice-got-it[aria-disabled="true"]').count(), 1, `${lang}: Got it is inert`);
      // Activity on, publisher: no notice, and the scope line says so.
      await visit(hadeer, previewHome(w.school, 'home'));
      assert.equal(await hadeer.locator('#notice-card, #notice-line').count(), 0, `${lang}: the publisher sees no notice`);
      assert.ok((await hadeer.locator('#preview-scope').innerText()).trim().endsWith(word(lang, 'previewNoNotice')), `${lang}: "Space notices are not shown here."`);
      if (lang === 'ar') await uxShot(hadeer, 'UX-23-phone-ar-publisher-activity');
    }
  });
});

// ------------------------------------------------------------------ UX-24 ----

describe('UX-24 no sideways scroll in preview and entry pages', { concurrency: false }, () => {
  for (const width of ['phone', 'tablet', 'desktop', 320] as const) {
    it(`UX-24 ${width === 320 ? '320 px (reflow)' : width}: no sideways scroll and no clipped text, in Arabic and English`, async () => {
      let pages = 0;
      for (const lang of LANGS) {
        for (const [who, name, path] of [...previewPages(), ...entryPages()]) {
          const page = await open(who, lang, width);
          await visit(page, path);
          const o = await overflow(page);
          assert.ok(o.sideways <= 0, `${lang} ${width} ${name}: no sideways scroll (${o.sideways} px)`);
          assert.deepEqual(o.clipped, [], `${lang} ${width} ${name}: no text overflows its box`);
          pages++;
        }
      }
      assert.ok(pages >= 2 * 19, `${pages} pages checked`);
    });
  }
});

// ------------------------------------------------------------------ UX-25 ----

describe('UX-25 sizes and contrast in preview and entry pages', { concurrency: false }, () => {
  it('UX-25 Back at both ends and the entry links are 44 x 44 px or more; new text is 14 px or more with 4.5:1 contrast', async (t) => {
    let controls = 0;
    let texts = 0;
    for (const lang of LANGS) {
      const pages: [Who, string, string, string[], string[]][] = [
        ...previewPages().map(([who, name, path]) => [who, name, path, ['#preview-back', '#preview-back-end'], ['#preview-banner [data-line]', '#preview-end p']] as [Who, string, string, string[], string[]]),
        ...entryPages().filter(([, name]) => !name.includes('editor')).map(([who, name, path]) => [who, name, path, ['#view-as'], ['#view-as']] as [Who, string, string, string[], string[]]),
      ];
      for (const [who, name, path, controlSel, textSel] of pages) {
        const page = await open(who, lang);
        await visit(page, path);
        for (const sel of controlSel) {
          const found = await measure(page, sel);
          assert.ok(found.length, `${lang} ${name}: ${sel} is on the page`);
          for (const m of found) {
            controls++;
            assert.ok(m.width >= 44 && m.height >= 44, `${lang} ${name} ${sel}: ${m.width.toFixed(1)} x ${m.height.toFixed(1)} px`);
            assert.ok(m.fontPx >= 14 && m.contrast >= 4.5, `${lang} ${name} ${sel}: ${m.fontPx} px, contrast ${m.contrast.toFixed(2)}`);
          }
        }
        for (const sel of textSel) {
          const found = await measure(page, sel);
          assert.ok(found.length, `${lang} ${name}: ${sel} is on the page`);
          for (const m of found) {
            texts++;
            assert.ok(m.fontPx >= 14, `${lang} ${name} ${sel} "${m.text}": ${m.fontPx} px`);
            assert.ok(m.contrast >= 4.5, `${lang} ${name} ${sel} "${m.text}": contrast ${m.contrast.toFixed(2)}`);
          }
        }
      }
    }
    t.diagnostic(`UX-25 measured ${controls} controls and ${texts} texts`);
  });
});

// ------------------------------------------------------------------ UX-26 ----

describe('UX-26 Arabic, mixed text and kit words in preview (three kits)', { concurrency: false }, () => {
  it('UX-26 every added key has both values, and they differ', () => {
    for (const key of W3A_KEYS) {
      assert.ok((UI.en as Record<string, string>)[key] && (UI.ar as Record<string, string>)[key], key);
      for (const piece of fixedWords('en', key)) assert.ok(!(UI.ar as Record<string, string>)[key].includes(piece), `${key}: the Arabic value is not the English one`);
    }
  });

  for (const kit of ['school', 'company', 'university'] as const) {
    for (const lang of LANGS) {
      it(`UX-26 ${kit} ${lang}: lang and dir, data and kit words isolated, no word of the other language, kit words in "View as"`, async () => {
        const s = w[kit];
        const admin = { school: ADMIN, company: COMPANY_ADMIN, university: UNIVERSITY_ADMIN }[kit];
        const learner = word(lang, 'learner', {}, kit);
        const other = lang === 'ar' ? 'en' : 'ar';
        const foreign = W3A_KEYS.flatMap((k) => fixedWords(other, k).map((p) => [k, p] as const));
        const page = await open(admin, lang);
        await visit(page, home(s));
        assert.equal((await page.locator('#view-as').innerText()).trim(), word(lang, 'viewAsLearner', { learner }, kit), `${kit} ${lang}: "View as" names the kit's learner`);
        const paths: [string, string][] = [
          ['preview home', previewHome(s, 'home')],
          ['outline', previewSubject(s, s.math, 'all', 'home')],
          ['lesson', previewLesson(s, s.lessons['Reading decimals'], 'home')],
          ['My results', previewResults(s, 'home')],
        ];
        for (const [name, path] of paths) {
          await visit(page, path);
          const facts = await page.evaluate(({ data, kitWord }) => {
            const loose: string[] = [];
            const scan = (root: Element, isolatedBy: string) => {
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                const text = n.textContent ?? '';
                for (const d of data) if (text.includes(d) && !n.parentElement!.closest(isolatedBy)) loose.push(`${d} in <${n.parentElement!.tagName.toLowerCase()}>`);
              }
            };
            scan(document.querySelector('main')!, 'bdi, [dir]:not(html), script, style');
            // In the banner (which carries its own dir), the kit word must sit in <bdi> or dir="auto".
            const banner = document.getElementById('preview-banner')!;
            const walker = document.createTreeWalker(banner, NodeFilter.SHOW_TEXT);
            let kitSeen = 0;
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (!(n.textContent ?? '').includes(kitWord) || n.parentElement!.closest('style')) continue;
              kitSeen++;
              if (!n.parentElement!.closest('bdi, [dir="auto"]')) loose.push(`kit word "${kitWord}" in the banner's <${n.parentElement!.tagName.toLowerCase()}>`);
            }
            return { lang: document.documentElement.lang, dir: document.documentElement.dir, bLang: banner.lang, bDir: banner.dir, loose, kitSeen, text: document.body.innerText };
          }, { data: ['Mathematics', 'Adding fractions', 'Reading club', 'Fractions', MIXED_TITLE], kitWord: learner });
          const dir = lang === 'ar' ? 'rtl' : 'ltr';
          assert.deepEqual([facts.lang, facts.dir, facts.bLang, facts.bDir], [lang, dir, lang, dir], `${kit} ${lang} ${name}: lang and dir on the page and the banner`);
          assert.ok(facts.kitSeen >= 1, `${kit} ${lang} ${name}: the kit's learner word is in the banner`);
          assert.deepEqual(facts.loose, [], `${kit} ${lang} ${name}: data and kit words are isolated`);
          const shown = facts.text.replace(/PDF/g, ' ');
          const hits = foreign.filter(([, p]) => shown.includes(p)).map(([k, p]) => `${k}: "${p}"`);
          assert.deepEqual(hits, [], `${kit} ${lang} ${name}: no ${other === 'en' ? 'English' : 'Arabic'} word of the new keys`);
        }
        if (kit === 'university' && lang === 'ar') {
          await visit(page, previewHome(s, 'home'));
          await uxShot(page, 'UX-26-phone-ar-university');
        }
      });
    }
  }
});
