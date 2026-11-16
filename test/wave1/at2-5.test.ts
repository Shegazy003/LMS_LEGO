// AT-2.5 (product-contract v2, LMS wave 1, L1, section 6.3): coming back from
// "Reading decimals" (the trail's subject link or "Back to the outline") opens
// Mathematics with only "Decimals" open, and at 390 px the top of "Decimals"
// is at or below the bottom of the top navigation and inside the viewport;
// from the home, all folded. A chapter value that is not a non-removed chapter
// of this subject is ignored (all folded, no error).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { SALMA, as, browserAs, go, home, lessonPath, subjectPath, wave1World, type Wave1World } from './world.ts';
import { chaptersOn } from './lesson.ts';

async function onlyDecimalsOpen(page: Page, where: string): Promise<void> {
  const chapters = await chaptersOn(page);
  assert.deepEqual(chapters.filter((c) => c.open).map((c) => c.title), ['Decimals'], `${where}: only Decimals is open`);
  const box = await page.evaluate(() => {
    const nav = document.querySelector('nav#top-nav')!.getBoundingClientRect();
    const open = document.querySelector('#outline details[open]')!.getBoundingClientRect();
    return { navBottom: nav.bottom, top: open.top, height: window.innerHeight };
  });
  assert.ok(box.top >= box.navBottom - 0.5, `${where}: the top of Decimals (${box.top}) is at or below the top navigation (${box.navBottom})`);
  assert.ok(box.top >= 0 && box.top < box.height, `${where}: and inside the viewport (${box.top} of ${box.height})`);
}

describe('AT-2.5 the way back from a lesson opens its chapter in view; a wrong chapter value is ignored', { concurrency: false }, () => {
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

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}, 390 px: the trail link and Back to the outline from "Reading decimals"; from the home all folded`, async () => {
      const s = w.school;
      const tab = await browserAs(browser, w, SALMA, { lang, width: 'phone' });
      for (const way of ['#trail a[href*="/learn/"]', 'a#back-to-outline']) {
        await go(tab.page, w, lessonPath(s, s.lessons['Reading decimals']));
        await Promise.all([tab.page.waitForEvent('load'), tab.page.locator(way).click()]);
        assert.ok(tab.page.url().includes(`?open=${s.chapters.Decimals}`), 'the address carries the chapter');
        await onlyDecimalsOpen(tab.page, way);
      }
      await go(tab.page, w, lessonPath(s, s.lessons['Review sheet']));
      await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#back-to-outline').click()]);
      assert.deepEqual((await chaptersOn(tab.page)).filter((c) => c.open).map((c) => c.title), ['Review'], 'from Review sheet: only Review');
      await go(tab.page, w, home(s));
      await Promise.all([tab.page.waitForEvent('load'), tab.page.locator(`#my-list a[href="${subjectPath(s, s.math)}"]`).click()]);
      assert.deepEqual((await chaptersOn(tab.page)).map((c) => c.open), [false, false, false, false, false], 'from the home: all folded');
      await tab.ctx.close();
    });
  }

  it('390 px: the Decimals return, the way the lesson links it', async () => {
    const s = w.school;
    const tab = await browserAs(browser, w, SALMA, { lang: 'ar', width: 'phone' });
    await go(tab.page, w, lessonPath(s, s.lessons['Reading decimals']));
    const href = await tab.page.locator('#trail a[href*="/learn/"]').getAttribute('href');
    assert.equal(href, `${subjectPath(s, s.math, s.chapters.Decimals)}#chapter-${s.chapters.Decimals}`);
    await go(tab.page, w, href!);
    await onlyDecimalsOpen(tab.page, 'typed');
    await tab.ctx.close();
  });

  it('a value that is not a non-removed chapter of this subject is ignored: all folded, 200', async () => {
    const s = w.school;
    const c = await as(w, SALMA);
    for (const value of [s.chapters['Draft chapter'], s.arabicChapters.Nouns, 'nonsense', '', '%3Cscript%3E', s.chapters.Decimals + 'x']) {
      const res = await c.get(subjectPath(s, s.math) + `?open=${value}`);
      assert.equal(res.status, 200, `?open=${value}`);
      const body = await res.text();
      assert.equal((body.match(/<details[^>]*\bdata-chapter="[^"]*"[^>]*\bopen\b/g) ?? []).length, 0, `?open=${value}: all folded`);
      assert.ok(!body.includes('<script>alert'), 'the value is never written back');
    }
  });
});
