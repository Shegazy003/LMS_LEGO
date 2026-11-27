// UX-6 (ux-plan v2, LMS wave 1, L1): the outline folds. Chapters are
// <details>/<summary>; each summary shows the title, the lesson count and an
// open/closed marker that turns with the state (decorative). Expand all and
// Collapse all sit above the chapters, only when there are more than three.
// The chapter opened by ?open= is scrolled into view: at 390, 768 and 1280 px
// its top is at or below the bottom of the top navigation and inside the
// viewport. Screenshots: the standard set (Mathematics, all folded) and
// UX-6-phone-ar-open (back from "Reading decimals").
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, browserAs, go, lessonPath, subjectPath, uxShot, wave1World, type Wave1World, type Width } from './world.ts';

describe('UX-6 outline folds and opens the right chapter', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave1World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  const shots: [Width, 'ar' | 'en', 'school' | 'company'][] = [
    ['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company'],
  ];
  for (const [width, lang, kit] of shots) {
    it(`${width} ${lang} ${kit}: summaries with title, count and a turning marker; Expand all and Collapse all above`, async () => {
      const s = w[kit];
      const tab = await browserAs(browser, w, SALMA, { lang, width });
      await go(tab.page, w, subjectPath(s, s.math));
      const m = await tab.page.evaluate(() => {
        const summaries = [...document.querySelectorAll('#outline details > summary')];
        const marker = (sum: Element) => {
          const mk = sum.querySelector('[aria-hidden="true"]') as HTMLElement | null;
          return mk ? { hidden: true, shape: getComputedStyle(mk, '::before').content + getComputedStyle(mk).transform } : null;
        };
        const fold = document.querySelector('#fold-all')!.getBoundingClientRect();
        const firstChapter = document.querySelector('#outline details')!.getBoundingClientRect();
        return {
          count: summaries.length, parts: summaries.map((sum) => [Boolean(sum.querySelector('.title')), Boolean(sum.querySelector('.count'))]),
          closed: marker(summaries[0]), foldAbove: fold.bottom <= firstChapter.top + 1,
        };
      });
      assert.equal(m.count, 5);
      for (const [title, count] of m.parts) assert.ok(title && count, 'each summary: title and count');
      assert.ok(m.closed?.hidden, 'the marker is decorative (aria-hidden)');
      assert.ok(m.foldAbove, 'Expand all and Collapse all sit above the chapters');
      await uxShot(tab.page, `UX-6-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
      await tab.page.locator('#outline details > summary').first().click();
      const open = await tab.page.evaluate(() => {
        const mk = document.querySelector('#outline details > summary [aria-hidden="true"]') as HTMLElement;
        return getComputedStyle(mk, '::before').content + getComputedStyle(mk).transform;
      });
      assert.notEqual(open, m.closed?.shape, 'the marker turns when the chapter opens');
      await tab.ctx.close();
    });
  }

  for (const width of ['phone', 'tablet', 'desktop'] as const) {
    it(`${width}: back from "Reading decimals", Decimals is open and in view below the top navigation`, async () => {
      const s = w.school;
      const tab = await browserAs(browser, w, SALMA, { lang: 'ar', width });
      await go(tab.page, w, lessonPath(s, s.lessons['Reading decimals']));
      await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('#trail a[href*="/learn/"]').click()]);
      const box = await tab.page.evaluate(() => {
        const nav = document.querySelector('nav#top-nav')!.getBoundingClientRect();
        const open = [...document.querySelectorAll('#outline details[open]')];
        const r = open[0]!.getBoundingClientRect();
        // LMS redesign R1a (UX-3 row, S9, UX-96): below 960 px the navigation is a bottom bar; then in view means
        // inside the viewport and above the bar (its top), and nothing is below a top navigation.
        const bar = nav.top > window.innerHeight / 2;
        return { n: open.length, title: open[0]!.querySelector('.title')!.textContent, navBottom: bar ? 0 : nav.bottom, top: r.top, height: bar ? nav.top : window.innerHeight };
      });
      assert.equal(box.n, 1);
      assert.equal(box.title, 'Decimals');
      assert.ok(box.top >= box.navBottom - 0.5, `${width}: at or below the top navigation (${box.top} >= ${box.navBottom})`);
      assert.ok(box.top >= 0 && box.top < box.height, `${width}: inside the viewport`);
      if (width === 'phone') await uxShot(tab.page, 'UX-6-phone-ar-open');
      await tab.ctx.close();
    });
  }
});
