// UX-4 (ux-plan v2, LMS wave 1, L1): after the last material, a <nav> named
// "<lesson> navigation" holds Next and Previous as large link targets (at
// least 44 px tall). Phone (390): stacked full width, Next above Previous, in
// both languages. Tablet and desktop: side by side; in Arabic Next on the left
// with a left-pointing arrow and Previous on the right; in English the
// reverse. Next's first line "Next: <title>"; when crossing chapters a second
// line "<chapter>: <chapter title>" inside the same link. Arrows are
// decorative (aria-hidden). The place "<lesson> N / M" is under the title.
// Screenshots: the standard set, on "Comparing fractions" (its Next crosses into Decimals).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, browserAs, go, lessonPath, uxShot, wave1World, words, type Wave1World, type Width } from './world.ts';

describe('UX-4 next and previous at the end of the lesson', { concurrency: false }, () => {
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

  const cases: [Width, 'ar' | 'en', 'school' | 'company'][] = [
    ['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company'],
    ['tablet', 'en', 'school'], ['desktop', 'en', 'school'],
  ];
  for (const [width, lang, kit] of cases) {
    it(`${width} ${lang} ${kit}: order, size, arrows and the two lines`, async () => {
      const t = words(kit, lang);
      const s = w[kit];
      const tab = await browserAs(browser, w, SALMA, { lang, width });
      await go(tab.page, w, lessonPath(s, s.lessons['Comparing fractions']));
      const m = await tab.page.evaluate(() => {
        const nav = document.querySelector('nav#lesson-nav')!;
        const box = (sel: string) => {
          const el = nav.querySelector(sel) as HTMLElement;
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        const arrow = (sel: string) => {
          const a = nav.querySelector(`${sel} [aria-hidden="true"]`) as HTMLElement | null;
          return a ? a.textContent?.trim() ?? '' : null;
        };
        const lines = [...nav.querySelectorAll('#next-lesson > span:not([aria-hidden])')].map((e) => {
          const r = e.getBoundingClientRect();
          return { text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), top: r.top };
        });
        const items = document.querySelector('#items')!.getBoundingClientRect();
        const head = document.querySelector('#lesson-title')!.getBoundingClientRect();
        const place = document.querySelector('#lesson-place')!.getBoundingClientRect();
        return {
          label: nav.getAttribute('aria-label'), next: box('#next-lesson'), prev: box('#previous-lesson'), navWidth: nav.getBoundingClientRect().width,
          nextArrow: arrow('#next-lesson'), prevArrow: arrow('#previous-lesson'), lines, afterItems: nav.getBoundingClientRect().top >= items.bottom,
          placeUnderTitle: place.top >= head.bottom - 1,
        };
      });
      assert.equal(m.label, t('lessonNav'));
      assert.ok(m.afterItems, 'after the last material');
      assert.ok(m.placeUnderTitle, 'the place is under the title');
      assert.ok(m.next.height >= 44 && m.prev.height >= 44, `large targets (${m.next.height}, ${m.prev.height})`);
      if (width === 'phone') {
        assert.ok(m.next.bottom <= m.prev.top + 1, 'phone: Next above Previous');
        assert.ok(m.next.width >= m.navWidth - 1 && m.prev.width >= m.navWidth - 1, 'phone: full width');
      } else {
        assert.ok(Math.abs(m.next.top - m.prev.top) < 2, `${width}: side by side`);
        if (lang === 'ar') assert.ok(m.next.right <= m.prev.left + 1, 'Arabic: Next on the left, Previous on the right');
        else assert.ok(m.prev.right <= m.next.left + 1, 'English: Previous on the left, Next on the right');
      }
      assert.equal(m.nextArrow, lang === 'ar' ? '←' : '→', 'Next\'s arrow points the reading way');
      assert.equal(m.prevArrow, lang === 'ar' ? '→' : '←', 'Previous\'s arrow points back');
      assert.deepEqual(m.lines.map((l) => l.text), [t('nextLesson', { title: 'Reading decimals' }), t('chapterLine', { title: 'Decimals' })]);
      assert.ok(m.lines[1].top > m.lines[0].top, 'the chapter is on a second line');
      if (!(width !== 'phone' && lang === 'en')) await uxShot(tab.page, `UX-4-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
      await tab.ctx.close();
    });
  }
});
