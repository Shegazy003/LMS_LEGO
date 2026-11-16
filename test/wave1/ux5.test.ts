// UX-5 (ux-plan v2, LMS wave 1, L1): first lesson: "Back to the outline" in
// Previous's place. Last lesson: the end sentence as a status-styled line,
// then "Back to the outline" and "Home". No disabled, greyed or dead buttons.
// Screenshot UX-5-phone-ar (the last lesson).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, browserAs, go, lessonPath, uxShot, wave1World, type Wave1World } from './world.ts';

describe('UX-5 first and last lesson', { concurrency: false }, () => {
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

  for (const width of ['phone', 'tablet'] as const) {
    it(`${width} ar: the first lesson's Back to the outline takes Previous's place; the last lesson's end`, async () => {
      const s = w.school;
      const tab = await browserAs(browser, w, SALMA, { lang: 'ar', width });
      const dead = async () => tab.page.locator('#lesson-nav').evaluate((nav) => [...nav.querySelectorAll('a, button')].filter((e) =>
        e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true' || (e.tagName === 'A' && !e.getAttribute('href')) || Number(getComputedStyle(e).opacity) < 1).length);

      await go(tab.page, w, lessonPath(s, s.lessons['Adding fractions']));
      const first = await tab.page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        return { next: r('#next-lesson'), back: r('#back-to-outline'), prev: document.querySelector('#previous-lesson') !== null };
      });
      assert.equal(first.prev, false, 'no Previous');
      if (width === 'phone') assert.ok(first.back.top >= first.next.bottom - 1, 'phone: under Next, where Previous goes');
      else assert.ok(Math.abs(first.back.top - first.next.top) < 2 && first.back.left > first.next.right - 1, 'tablet: beside Next on the right, where Previous goes in Arabic');
      assert.ok(first.back.height >= 44);
      assert.equal(await dead(), 0, 'no dead control');

      await go(tab.page, w, lessonPath(s, s.lessons['Review sheet']));
      const last = await tab.page.evaluate(() => {
        const end = document.querySelector('#lesson-nav #last-lesson') as HTMLElement;
        const order = [...document.querySelectorAll('#lesson-nav #last-lesson, #lesson-nav #back-to-outline, #lesson-nav #end-home')].map((e) => e.id);
        return { role: end?.getAttribute('role'), cls: end?.className, order, next: document.querySelector('#next-lesson') !== null };
      });
      assert.equal(last.next, false, 'no Next');
      assert.equal(last.role, 'status', 'the end sentence is a status line');
      assert.deepEqual(last.order, ['last-lesson', 'back-to-outline', 'end-home'], 'the sentence, then the outline, then Home');
      assert.equal(await dead(), 0, 'no dead control');
      for (const id of ['back-to-outline', 'end-home']) assert.ok((await tab.page.locator(`#${id}`).boundingBox())!.height >= 44, `${id} is a large target`);
      if (width === 'phone') await uxShot(tab.page, 'UX-5-phone-ar');
      await tab.ctx.close();
    });
  }
});
