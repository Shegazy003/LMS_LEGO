// UX-16a (ux-plan v2, LMS wave 1, L1): lang and dir are right on every changed
// page; titles and names from data are in <bdi> or dir="auto"; numbers such as
// "2 / 5" show as the product shows them today (Western digits, left to right).
// Language check by key: on an Arabic page none of the English values of the
// keys task L1 adds appears as visible text, and on an English page none of
// their Arabic values, except data, "PDF", the space's name and logo text.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { UI } from '../../src/i18n/ui.ts';
import { HADEER, SALMA, activity, browserAs, go, wave1World, withResults, type Wave1World } from './world.ts';
import { MIXED_TITLE, learnerPages, longTitles } from './pages.ts';

/** The keys task L1 adds to src/i18n/ui.ts. */
export const L1_KEYS = [
  'mainNav', 'teacherLine', 'lessonCount', 'lessonCountOne', 'noLessonsYet', 'startLesson', 'lessonPlace', 'lessonNav', 'nextLesson', 'previousLesson',
  'chapterLine', 'backToOutline', 'lastLesson', 'expandAll', 'collapseAll', 'activityDetail', 'activityGotIt',
] as const;

/** The fixed words of a key's value in one language: the pieces between its {placeholders}, three letters or more. */
function fixedWords(lang: 'ar' | 'en', key: string): string[] {
  const value = (UI[lang] as Record<string, string>)[key];
  return value.split(/\{\w+\}/).map((p) => p.replace(/^[\s:.·!?،]+|[\s:.·!?،]+$/g, '')).filter((p) => (p.match(/\p{L}/gu) ?? []).length >= 3);
}

describe('UX-16a Arabic and mixed text on learner pages', { concurrency: false }, () => {
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

  it('every key the task adds has an Arabic and an English value, and they differ where they hold words', () => {
    for (const key of L1_KEYS) {
      assert.ok((UI.en as Record<string, string>)[key] && (UI.ar as Record<string, string>)[key], key);
      for (const piece of fixedWords('en', key)) assert.ok(!(UI.ar as Record<string, string>)[key].includes(piece), `${key}: the Arabic value is not the English one`);
    }
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: lang and dir, data in bdi or dir, numbers as today, and no word of the other language`, async () => {
      const other = lang === 'ar' ? 'en' : 'ar';
      const foreign = L1_KEYS.flatMap((k) => fixedWords(other, k).map((p) => [k, p] as const));
      const tab = await browserAs(browser, w, SALMA, { lang });
      for (const [name, path] of learnerPages(w, w.school, result)) {
        await go(tab.page, w, path);
        const page = await tab.page.evaluate((data) => {
          const html = document.documentElement;
          const isolated: string[] = [];
          const loose: string[] = [];
          const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const text = n.textContent ?? '';
            for (const d of data) {
              if (!text.includes(d)) continue;
              const el = n.parentElement!;
              (el.closest('bdi, [dir]:not(html), script, style') ? isolated : loose).push(`${d} in <${el.tagName.toLowerCase()} class="${el.className}">`);
            }
          }
          const place = document.querySelector('#lesson-place');
          const placeNumber = place?.querySelector('bdi');
          return {
            lang: html.lang, dir: html.dir, loose, isolated: isolated.length,
            place: placeNumber ? { text: placeNumber.textContent, dir: placeNumber.getAttribute('dir') } : null,
            text: document.body.innerText,
          };
        }, ['Mathematics', 'Adding fractions', 'Review sheet', 'Reading club', 'First book', 'Fractions', MIXED_TITLE, HADEER.display_name]);
        assert.equal(page.lang, lang, `${name}: lang`);
        assert.equal(page.dir, lang === 'ar' ? 'rtl' : 'ltr', `${name}: dir`);
        assert.deepEqual(page.loose, [], `${name}: every title and name from data is in <bdi> or dir`);
        if (page.place) {
          assert.match(page.place.text ?? '', /^\d+ \/ \d+$/, `${name}: the place in Western digits, as the product shows numbers today`);
          assert.equal(page.place.dir, 'ltr', `${name}: and kept left to right`);
        }
        const shown = page.text.replace(/PDF/g, ' ');
        const hits = foreign.filter(([, p]) => shown.includes(p)).map(([k, p]) => `${k}: "${p}"`);
        assert.deepEqual(hits, [], `${name}: no ${other === 'en' ? 'English' : 'Arabic'} word of the new keys`);
      }
      await tab.ctx.close();
    });
  }
});
