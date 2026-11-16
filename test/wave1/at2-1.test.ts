// AT-2.1 (product-contract v2, LMS wave 1, L1, section 5.1): Next follows
// exactly Adding fractions, Comparing fractions, Reading decimals, What is a
// percent, Review sheet (chapter order, then lesson order, by position); the
// empty chapter, the removed lesson and the removed chapter's lesson are
// skipped; Previous walks the same list backwards. Walked by following the
// links in a browser, in Arabic and English.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { MATH_ORDER, SALMA, browserAs, go, lessonPath, wave1World, type Wave1World } from './world.ts';
import { lessonEnd } from './lesson.ts';

describe('AT-2.1 Next and Previous follow the outline\'s order and skip empty and removed items', { concurrency: false }, () => {
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
    it(`${lang}: Next from "Adding fractions" to the end, then Previous back to the start`, async () => {
      const tab = await browserAs(browser, w, SALMA, { lang });
      await go(tab.page, w, lessonPath(w.school, w.school.lessons['Adding fractions']));
      const forward = [(await lessonEnd(tab.page)).title];
      for (let i = 0; i < 10 && (await tab.page.locator('a#next-lesson').count()); i++) {
        await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#next-lesson').click()]);
        forward.push((await lessonEnd(tab.page)).title);
      }
      assert.deepEqual(forward, MATH_ORDER);
      const back = [(await lessonEnd(tab.page)).title];
      for (let i = 0; i < 10 && (await tab.page.locator('a#previous-lesson').count()); i++) {
        await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#previous-lesson').click()]);
        back.push((await lessonEnd(tab.page)).title);
      }
      assert.deepEqual(back, [...MATH_ORDER].reverse());
      for (const skipped of ['Old decimals', 'Draft lesson']) assert.ok(!forward.includes(skipped), `${skipped} is skipped`);
      await tab.ctx.close();
    });
  }

  it('Arabic grammar: The noun, The dual, Past tense, Prepositions', async () => {
    const tab = await browserAs(browser, w, SALMA, { lang: 'en' });
    await go(tab.page, w, lessonPath(w.school, w.school.arabicLessons['The noun']));
    const seen = [(await lessonEnd(tab.page)).title];
    while (await tab.page.locator('a#next-lesson').count()) {
      await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#next-lesson').click()]);
      seen.push((await lessonEnd(tab.page)).title);
    }
    assert.deepEqual(seen, ['The noun', 'The dual', 'Past tense', 'Prepositions']);
    await tab.ctx.close();
  });
});
