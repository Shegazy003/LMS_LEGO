// UX-3 (ux-plan v2, LMS wave 1, L1): on every learner page a top navigation
// (<nav> with an accessible name) holds "Home" and "My results"; the current
// page has aria-current="page" and a visible marker that is not colour alone;
// it is the first landmark in the reading order (at the right in Arabic); no
// bottom "My results" link remains.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, browserAs, go, home, lessonPath, subjectPath, wave1World, withResults, words, type Wave1World } from './world.ts';

describe('UX-3 learner top navigation', { concurrency: false }, () => {
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
    it(`${lang}: home, subject, lesson, My results, one result`, async () => {
      const t = words('school', lang);
      const s = w.school;
      const tab = await browserAs(browser, w, SALMA, { lang });
      const pages: [string, string, 'nav-home' | 'nav-results' | null][] = [
        ['home', home(s), 'nav-home'], ['subject', subjectPath(s, s.math), null], ['lesson', lessonPath(s, s.lessons['Reading decimals']), null],
        ['My results', `/s/${s.id}/results`, 'nav-results'], ['one result', `/s/${s.id}/results/${result}`, 'nav-results'],
      ];
      for (const [name, path, current] of pages) {
        await go(tab.page, w, path);
        const nav = await tab.page.evaluate(() => {
          const n = document.querySelector('nav#top-nav') as HTMLElement | null;
          if (!n) return null;
          const links = [...n.querySelectorAll('a')].map((a) => {
            const cs = getComputedStyle(a);
            const box = a.getBoundingClientRect();
            return { id: a.id, text: a.innerText.trim(), current: a.getAttribute('aria-current'), weight: Number(cs.fontWeight), line: cs.textDecorationLine, left: box.left, right: box.right };
          });
          const landmarks = [...document.querySelectorAll('header, nav, main, aside, footer, [role]')].filter((e) => {
            const role = e.getAttribute('role');
            if (role) return !['none', 'presentation', 'button', 'status', 'alert'].includes(role);
            return !((e.tagName === 'HEADER' || e.tagName === 'FOOTER') && e.closest('main, article, aside, nav, section'));
          });
          return { label: n.getAttribute('aria-label') ?? '', links, first: landmarks[0]?.id ?? '' };
        });
        assert.ok(nav, `${name}: a top navigation`);
        assert.equal(nav.label, t('mainNav'), `${name}: it has an accessible name`);
        assert.equal(nav.first, 'top-nav', `${name}: it is the first landmark`);
        const homeLink = nav.links.find((l) => l.id === 'nav-home');
        const results = nav.links.find((l) => l.id === 'nav-results');
        assert.equal(homeLink?.text, t('home'));
        assert.equal(results?.text, t('myResults'));
        if (lang === 'ar') assert.ok(homeLink!.left > results!.right, `${name}: Arabic: Home starts at the right`);
        else assert.ok(homeLink!.right < results!.left, `${name}: English: Home starts at the left`);
        for (const l of nav.links) {
          assert.equal(l.current, l.id === current ? 'page' : null, `${name}: ${l.id} current`);
          if (l.id === current) {
            const others = nav.links.filter((o) => o.id !== current);
            assert.ok(l.line.includes('underline') || others.every((o) => l.weight - o.weight >= 200), `${name}: the current page is marked by more than colour`);
            assert.ok(others.every((o) => !o.line.includes('underline') || l.weight - o.weight >= 200), `${name}: and the others are not marked alike`);
          }
        }
        assert.equal(await tab.page.locator(`main a[href="/s/${s.id}/results"]:not(#back)`).count(), 0, `${name}: no bottom My results link`);
      }
      await tab.ctx.close();
    });
  }
});
