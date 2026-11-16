// UX-15a (ux-plan v2, LMS wave 1, L1): every new control is at least 44 x 44
// CSS px; new text is at least 14 px with contrast at least 4.5:1 against its
// background (WCAG 2 ratio from getComputedStyle, against the nearest opaque
// background), in Arabic and English, at phone width.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, activity, browserAs, go, home, lessonPath, subjectPath, wave1World, type Wave1World } from './world.ts';
import { measure } from './ux.ts';

/** The controls and the text task L1 adds, per page. */
const NEW: [string, (s: Wave1World['school']) => string, string[], string[]][] = [
  ['home (full notice)', (s) => home(s), ['#top-nav a', '#my-list a.start', '#my-list h2 a', '#notice-got-it'],
    ['#my-list .teacher', '#my-list .count', '#my-list .none', '#notice-card #activity-notice', '#notice-card #activity-detail']],
  ['home (folded notice)', (s) => home(s), ['#notice-more > summary'], ['#notice-line #activity-notice', '#notice-more > summary']],
  ['outline', (s) => subjectPath(s, s.math), ['#expand-all', '#collapse-all', '#outline summary'], ['#outline summary .title', '#outline summary .count']],
  ['outline open', (s) => subjectPath(s, s.math, 'all'), ['#outline a[data-lesson]'], ['#outline .none']],
  ['middle lesson', (s) => lessonPath(s, s.lessons['Comparing fractions']), ['#lesson-nav a'], ['#lesson-place', '#next-lesson .line1', '#next-lesson .line2', '#previous-lesson .line1']],
  ['last lesson', (s) => lessonPath(s, s.lessons['Review sheet']), ['#lesson-nav a'], ['#last-lesson']],
];

describe('UX-15a sizes and contrast on learner pages', { concurrency: false }, () => {
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
    it(`${lang} 390 px: controls 44 x 44, text 14 px and 4.5:1`, async () => {
      const tab = await browserAs(browser, w, SALMA, { lang });
      let controls = 0;
      let texts = 0;
      for (const [name, path, controlSel, textSel] of NEW) {
        await go(tab.page, w, path(w.school));
        for (const sel of controlSel) {
          const found = await measure(tab.page, sel);
          assert.ok(found.length, `${name}: ${sel} is on the page`);
          for (const m of found) {
            controls++;
            assert.ok(m.width >= 44 && m.height >= 44, `${name} ${sel} "${m.text}": ${m.width.toFixed(1)} x ${m.height.toFixed(1)} px`);
          }
        }
        for (const sel of textSel) {
          const found = await measure(tab.page, sel);
          assert.ok(found.length, `${name}: ${sel} is on the page`);
          for (const m of found) {
            texts++;
            assert.ok(m.fontPx >= 14, `${name} ${sel} "${m.text}": ${m.fontPx} px`);
            assert.ok(m.contrast >= 4.5, `${name} ${sel} "${m.text}": contrast ${m.contrast.toFixed(2)}`);
          }
        }
      }
      assert.ok(controls >= 20 && texts >= 15, `measured ${controls} controls and ${texts} texts`);
      await tab.ctx.close();
    });
  }
});
