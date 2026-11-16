// UX-14b (ux-plan v2 on PIL-210, L2): at 390, 768 and 1280 px, in Arabic and
// English, every page L2 changes (the guardian home, the lesson editor in each
// state, /signin, /recover, /setup) has scrollWidth <= clientWidth and no
// element with text overflowing its box, checked on the longest made-up titles
// (a 120-character lesson title as "Last opened" and in the editor, an Arabic
// exam and material title with Latin words). Reflow: the same scrollWidth
// check also passes at 320 px.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { overflow } from '../wave1/ux.ts';
import { LONG_LESSON, PAGES, open, sizes, sweepWorld, tabFor, type Sweep, type Who } from './pages.ts';

describe('UX-14b no sideways scroll on guardian, editor and sign-in pages', { concurrency: false }, () => {
  let s: Sweep;
  let browser: Browser;
  before(async () => {
    s = await sweepWorld();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await s?.close();
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: 390, 768, 1280 and 320 px, every changed page`, async () => {
      let checked = 0;
      for (const who of ['mona', 'hadeer', 'nobody'] as Who[]) {
        const tab = await tabFor(browser, s, who, lang);
        for (const p of PAGES.filter((x) => x.who === who)) {
          for (const width of ['phone', 'tablet', 'desktop', 'reflow'] as const) {
            await tab.page.setViewportSize(sizes(width));
            await open(tab.page, s, p);
            const o = await overflow(tab.page);
            assert.ok(o.sideways <= 0, `${lang} ${p.name} at ${sizes(width).width}px: no sideways scroll (${o.sideways}px)`);
            if (width !== 'reflow') assert.deepEqual(o.clipped, [], `${lang} ${p.name} at ${sizes(width).width}px: no clipped text`);
            checked++;
          }
          if (p.name === 'guardian home') assert.ok((await tab.page.locator('main').innerText()).includes(LONG_LESSON), 'the 120-character title is on the guardian home');
        }
        await tab.close();
      }
      assert.equal(checked, 9 * 4);
    });
  }
});
