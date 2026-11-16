// UX-14a (ux-plan v2, LMS wave 1, L1): at 390, 768 and 1280 px, in Arabic and
// English, every learner page task L1 changes has scrollWidth <= clientWidth
// and no element whose text overflows its box, checked with the longest
// made-up titles (a 120-character lesson title, an Arabic title with Latin
// words). Reflow: the same scrollWidth check also passes at 320 px.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, activity, browserAs, go, wave1World, withResults, type Wave1World } from './world.ts';
import { LONG_LESSON, learnerPages, longTitles } from './pages.ts';
import { overflow } from './ux.ts';

describe('UX-14a no sideways scroll on learner pages', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  let result = '';
  before(async () => {
    w = await wave1World();
    result = (await withResults(w)).salma;
    await longTitles(w, w.school);
    await activity(w, true);
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('the long title is 120 characters', () => assert.equal(LONG_LESSON.length, 120));

  for (const lang of ['ar', 'en'] as const) {
    for (const width of [390, 768, 1280, 320]) {
      it(`${lang} ${width} px: every changed learner page`, async () => {
        const tab = await browserAs(browser, w, SALMA, { lang });
        await tab.page.setViewportSize({ width, height: 844 });
        for (const [name, path] of learnerPages(w, w.school, result)) {
          await go(tab.page, w, path);
          const o = await overflow(tab.page);
          assert.ok(o.sideways <= 0, `${name}: no sideways scroll (${o.sideways} px)`);
          if (width !== 320) assert.deepEqual(o.clipped, [], `${name}: no text overflows its box`);
        }
        await tab.ctx.close();
      });
    }
  }
});
