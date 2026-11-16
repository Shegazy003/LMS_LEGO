// AT-2.2 (product-contract v2, LMS wave 1, L1, section 5.2): each lesson page
// shows its place "<lesson word> N / 5" and, at the end of its materials, the
// Next link "Next: <title>" and the Previous link "Previous: <title>"; when
// Next crosses into another chapter, the Next link has a second line
// "<chapter word>: <chapter title>" (from "Comparing fractions": "Next:
// Reading decimals" and "Chapter: Decimals").
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { MATH_ORDER, SALMA, browserAs, go, lessonPath, wave1World, words, type Wave1World } from './world.ts';
import { lessonEnd } from './lesson.ts';

const CHAPTER_OF: Record<string, string> = {
  'Adding fractions': 'Fractions', 'Comparing fractions': 'Fractions', 'Reading decimals': 'Decimals', 'What is a percent': 'Percent', 'Review sheet': 'Review',
};

describe('AT-2.2 the place under the title, and Next and Previous with their titles at the end of the materials', { concurrency: false }, () => {
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

  it('the English texts are exactly the contract\'s', () => {
    const t = words('school', 'en');
    assert.equal(t('lessonPlace', { place: '2 / 5' }), 'Lesson 2 / 5');
    assert.equal(t('nextLesson', { title: 'Reading decimals' }), 'Next: Reading decimals');
    assert.equal(t('chapterLine', { title: 'Decimals' }), 'Chapter: Decimals');
    assert.equal(t('previousLesson', { title: 'Adding fractions' }), 'Previous: Adding fractions');
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: every Mathematics lesson`, async () => {
      const t = words('school', lang);
      const s = w.school;
      const tab = await browserAs(browser, w, SALMA, { lang });
      for (const [i, title] of MATH_ORDER.entries()) {
        await go(tab.page, w, lessonPath(s, s.lessons[title]));
        const end = await lessonEnd(tab.page);
        assert.equal(end.title, title);
        assert.equal(end.place, t('lessonPlace', { place: `${i + 1} / 5` }), `${title}: its place`);
        assert.ok(end.afterMaterials, `${title}: the block is after the materials`);
        assert.equal(end.navName, t('lessonNav'), `${title}: the block's accessible name`);
        const next = MATH_ORDER[i + 1];
        if (next) {
          assert.equal(end.next?.line1, t('nextLesson', { title: next }), `${title}: Next`);
          assert.equal(end.next?.href, lessonPath(s, s.lessons[next]));
          const crosses = CHAPTER_OF[next] !== CHAPTER_OF[title];
          assert.equal(end.next?.line2 ?? null, crosses ? t('chapterLine', { title: CHAPTER_OF[next] }) : null, `${title}: the chapter line only when crossing`);
        }
        const previous = MATH_ORDER[i - 1];
        if (previous) {
          assert.equal(end.previous?.text, t('previousLesson', { title: previous }), `${title}: Previous`);
          assert.equal(end.previous?.href, lessonPath(s, s.lessons[previous]));
        }
      }
      await go(tab.page, w, lessonPath(s, s.lessons['Comparing fractions']));
      const end = await lessonEnd(tab.page);
      if (lang === 'en') assert.deepEqual([end.next?.line1, end.next?.line2], ['Next: Reading decimals', 'Chapter: Decimals']);
      assert.ok(!(end.next?.line1 ?? '').includes(t('chapter')), 'never "Next: <chapter>: <title>"');
      await tab.ctx.close();
    });
  }
});
