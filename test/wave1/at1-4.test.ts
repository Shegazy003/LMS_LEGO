// AT-1.4 (product-contract v2, LMS wave 1, L1, section 4.4): "My results" is in
// the main navigation at the top of every learner page (home, subject, lesson,
// My results, one result), marked as the current page on My results and on one
// result; the old link at the bottom of the home is gone (one way, not two).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, browserAs, go, home, lessonPath, subjectPath, wave1World, withResults, words, type Wave1World } from './world.ts';

describe('AT-1.4 My results is in the top navigation of every learner page, and the bottom link is gone', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  let result = '';
  before(async () => {
    w = await wave1World();
    result = (await withResults(w)).salma;
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: home, subject, lesson, My results and one result`, async () => {
      const t = words('school', lang);
      const s = w.school;
      const tab = await browserAs(browser, w, SALMA, { lang });
      const pages: [string, string, boolean][] = [
        ['home', home(s), false],
        ['subject', subjectPath(s, s.math), false],
        ['lesson', lessonPath(s, s.lessons['Comparing fractions']), false],
        ['My results', `/s/${s.id}/results`, true],
        ['one result', `/s/${s.id}/results/${result}`, true],
      ];
      for (const [name, path, current] of pages) {
        await go(tab.page, w, path);
        const nav = tab.page.locator('nav#top-nav');
        assert.equal(await nav.count(), 1, `${name}: one top navigation`);
        const link = nav.locator('a#nav-results');
        assert.equal((await link.innerText()).trim(), t('myResults'), `${name}: "My results" in it`);
        assert.equal(await link.getAttribute('href'), `/s/${s.id}/results`);
        assert.equal(await link.getAttribute('aria-current'), current ? 'page' : null, `${name}: ${current ? '' : 'not '}marked current`);
        const firstLandmark = await tab.page.evaluate(() => {
          const all = [...document.querySelectorAll('header, nav, main, aside, footer, [role]')];
          const landmark = all.find((e) => {
            const role = e.getAttribute('role');
            if (role) return ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'region', 'search', 'form'].includes(role);
            if (e.tagName === 'HEADER' || e.tagName === 'FOOTER') return !e.closest('main, article, aside, nav, section');
            return true;
          });
          return landmark?.id ?? landmark?.tagName ?? '';
        });
        assert.equal(firstLandmark, 'top-nav', `${name}: the top navigation is the first landmark`);
        // One way, not two: no other link to My results on the page.
        assert.equal(await tab.page.locator(`main a[href="/s/${s.id}/results"]:not(#back)`).count(), 0, `${name}: no second way to My results`);
      }
      await go(tab.page, w, home(s));
      assert.equal(await tab.page.locator('#my-results').count(), 0, 'the old bottom link is gone');
      await tab.ctx.close();
    });
  }
});
