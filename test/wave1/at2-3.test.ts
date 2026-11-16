// AT-2.3 (product-contract v2, LMS wave 1, L1, section 5.2): the first lesson
// has no Previous link and shows "Back to the outline" in its place; the last
// lesson has no Next link and shows "This is the last <lesson> of <subject
// title>." with "Back to the outline" and "Home". Reading club's "First book"
// shows both ends.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, browserAs, go, home, lessonPath, subjectPath, wave1World, words, type Wave1World } from './world.ts';
import { lessonEnd } from './lesson.ts';

describe('AT-2.3 the first and the last lesson, and a subject of one lesson', { concurrency: false }, () => {
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

  it('the English sentences are exactly the contract\'s', () => {
    const t = words('school', 'en');
    assert.equal(t('backToOutline'), 'Back to the outline');
    assert.equal(t('lastLesson', { title: 'Mathematics' }), 'This is the last Lesson of Mathematics.');
    assert.equal(t('home'), 'Home');
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: first, last, and both ends`, async () => {
      const t = words('school', lang);
      const s = w.school;
      const outline = (chapter: string) => `${subjectPath(s, s.math, s.chapters[chapter])}#chapter-${s.chapters[chapter]}`;
      const tab = await browserAs(browser, w, SALMA, { lang });

      await go(tab.page, w, lessonPath(s, s.lessons['Adding fractions']));
      const first = await lessonEnd(tab.page);
      assert.equal(first.previous, null, 'first: no Previous');
      assert.deepEqual(first.outline, { text: t('backToOutline'), href: outline('Fractions') }, 'first: Back to the outline in its place');
      assert.ok(first.next, 'first: Next');
      assert.equal(first.end, null);

      await go(tab.page, w, lessonPath(s, s.lessons['Review sheet']));
      const last = await lessonEnd(tab.page);
      assert.equal(last.next, null, 'last: no Next');
      assert.equal(last.end, t('lastLesson', { title: 'Mathematics' }), 'last: the end sentence');
      assert.deepEqual(last.outline, { text: t('backToOutline'), href: outline('Review') });
      assert.deepEqual(last.home, { text: t('home'), href: home(s) });
      assert.ok(last.previous, 'last: Previous');

      await go(tab.page, w, lessonPath(s, s.lessons['First book']));
      const only = await lessonEnd(tab.page);
      assert.equal(only.place, t('lessonPlace', { place: '1 / 1' }));
      assert.equal(only.next, null);
      assert.equal(only.previous, null);
      assert.equal(only.end, t('lastLesson', { title: 'Reading club' }));
      assert.equal(only.outline?.text, t('backToOutline'));
      assert.deepEqual(only.home, { text: t('home'), href: home(s) });
      assert.equal(only.links.filter((h) => h.includes('/learn/')).length, 1, 'one Back to the outline, not two');
      await tab.ctx.close();
    });
  }
});
