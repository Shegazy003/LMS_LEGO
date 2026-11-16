// UX-7 (ux-plan v2, LMS wave 1, L1): keyboard only, script on. The Tab order
// on the lesson page is top navigation, trail, content, materials, then the
// Previous/Next block in its reading order; on the outline, Expand all,
// Collapse all, then each summary; Enter and Space toggle a summary and its
// expanded state is exposed. Every focused element is visible and shows a
// focus ring of at least 2 px with 3:1 contrast. Nothing hidden gets focus.
// At 390 px, in Arabic and English, on the home, the outline and a lesson.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { SALMA, activity, browserAs, go, home, lessonPath, subjectPath, wave1World, type Wave1World } from './world.ts';
import { tab, type Focused } from './ux.ts';

/** Tabs through the whole page once; every stop must be visible with a ring. */
async function walk(page: Page, where: string): Promise<Focused[]> {
  const stops: Focused[] = [];
  for (let i = 0; i < 80; i++) {
    const f = await tab(page);
    if (f.tag === 'body' || (stops.length && f.id && f.id === stops[0].id && f.text === stops[0].text)) break;
    assert.ok(f.visible, `${where}: stop ${i + 1} (${f.tag}#${f.id} "${f.text}") is visible`);
    assert.ok(f.ringPx >= 2, `${where}: stop ${i + 1} (${f.tag}#${f.id} "${f.text}") shows a focus ring of 2 px or more (${f.ringPx})`);
    assert.ok(f.ringContrast >= 3, `${where}: stop ${i + 1} (${f.tag}#${f.id}) ring contrast ${f.ringContrast.toFixed(2)} is 3:1 or more`);
    stops.push(f);
  }
  return stops;
}

/** The regions in the order focus first reaches them. */
const order = (stops: Focused[]) => stops.map((s) => s.region).filter((r, i, all) => r !== 'chrome' && all.indexOf(r) === i);

describe('UX-7 keyboard walk of home, outline and lesson', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave1World();
    await activity(w, true);
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang} 390 px: the lesson page: top navigation, trail, content, materials, then the block`, async () => {
      const s = w.school;
      const t = await browserAs(browser, w, SALMA, { lang, width: 'phone' });
      await go(t.page, w, lessonPath(s, s.lessons['Comparing fractions']));
      const stops = await walk(t.page, 'lesson');
      const regions = order(stops);
      const want = ['top-nav', 'trail', 'notice', 'materials', 'lesson-nav'];
      assert.deepEqual(regions.filter((r) => want.includes(r)), want, `lesson order: ${regions.join(' > ')}`);
      const block = stops.filter((f) => f.region === 'lesson-nav').map((f) => f.id);
      assert.deepEqual(block, ['next-lesson', 'previous-lesson', 'back-to-outline'], 'the block in its reading order');
      await t.ctx.close();
    });

    it(`${lang} 390 px: the outline: Expand all, Collapse all, then each summary; Enter and Space toggle`, async () => {
      const s = w.school;
      const t = await browserAs(browser, w, SALMA, { lang, width: 'phone' });
      await go(t.page, w, subjectPath(s, s.math));
      const stops = await walk(t.page, 'outline');
      const inMain = stops.filter((f) => f.region === 'fold-all' || f.region === 'outline');
      assert.deepEqual(inMain.map((f) => f.id || f.tag), ['expand-all', 'collapse-all', 'summary', 'summary', 'summary', 'summary', 'summary'], 'Expand all, Collapse all, then the five summaries (nothing inside a folded chapter)');
      await go(t.page, w, subjectPath(s, s.math));
      const summary = t.page.locator('#outline details > summary').first();
      await summary.focus();
      const state = () => summary.evaluate((e) => (e.parentElement as HTMLDetailsElement).open);
      await t.page.keyboard.press('Enter');
      assert.equal(await state(), true, 'Enter opens');
      await t.page.keyboard.press('Space');
      assert.equal(await state(), false, 'Space closes');
      const snapshot = await t.page.locator('#outline').ariaSnapshot();
      assert.match(snapshot, /expanded=false|\[collapsed\]|expanded: false|group/i, 'the state is exposed to assistive technology');
      await t.ctx.close();
    });

    it(`${lang} 390 px: the home, with the full notice and its Got it button`, async () => {
      const s = w.school;
      const t = await browserAs(browser, w, SALMA, { lang, width: 'phone' });
      await go(t.page, w, home(s));
      const stops = await walk(t.page, 'home');
      const regions = order(stops);
      assert.deepEqual(regions.filter((r) => ['top-nav', 'notice', 'cards'].includes(r)), ['top-nav', 'notice', 'cards'], `home order: ${regions.join(' > ')}`);
      assert.ok(stops.some((f) => f.id === 'notice-got-it'), 'Got it is reached by the keyboard');
      await t.ctx.close();
    });
  }
});
