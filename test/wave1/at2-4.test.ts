// AT-2.4 (product-contract v2, LMS wave 1, L1, section 6.1 and 6.2):
// Mathematics (5 chapters shown, more than 3) opens with every chapter folded,
// each showing its title and its lesson count; "Expand all" opens all,
// "Collapse all" folds all. Arabic grammar (3 chapters) opens with all
// chapters open and no Expand all or Collapse all. The empty chapter, when
// opened, shows "No <lessons> here yet.". Also with script switched off.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { MATH_CHAPTERS, SALMA, browserAs, go, subjectPath, wave1World, words, type Wave1World } from './world.ts';
import { countText } from './home.ts';
import { chaptersOn } from './lesson.ts';

const COUNTS: Record<string, number> = { Fractions: 2, 'Empty chapter': 0, Decimals: 1, Percent: 1, Review: 1 };

describe('AT-2.4 a long outline opens folded with counts, Expand all and Collapse all; a short one opens in full', { concurrency: false }, () => {
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

  it('the English labels are exactly the contract\'s', () => {
    const t = words('school', 'en');
    assert.deepEqual([t('expandAll'), t('collapseAll')], ['Expand all', 'Collapse all']);
  });

  for (const lang of ['ar', 'en'] as const) {
    for (const script of [true, false]) {
      it(`${lang}, script ${script ? 'on' : 'off'}: Mathematics folded, Expand all, Collapse all; Arabic grammar open`, async () => {
        const t = words('school', lang);
        const s = w.school;
        const tab = await browserAs(browser, w, SALMA, { lang, script });
        await go(tab.page, w, subjectPath(s, s.math));
        let chapters = await chaptersOn(tab.page);
        assert.deepEqual(chapters.map((c) => c.title), MATH_CHAPTERS, 'five chapters, the removed one left out');
        assert.deepEqual(chapters.map((c) => c.open), [false, false, false, false, false], 'all folded');
        for (const c of chapters) assert.equal(c.count, countText(t, COUNTS[c.title], lang), `${c.title}: its count`);
        assert.equal(await tab.page.locator('#outline details[data-chapter] > summary').count(), 5, 'native disclosures');

        await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#expand-all').click()]);
        assert.equal((await tab.page.locator('a#expand-all').innerText()).trim(), t('expandAll'));
        chapters = await chaptersOn(tab.page);
        assert.deepEqual(chapters.map((c) => c.open), [true, true, true, true, true], 'Expand all opens all');
        const empty = chapters.find((c) => c.title === 'Empty chapter');
        assert.ok(empty?.text.includes(t('noLessonsYet')), 'the empty chapter says so');
        assert.deepEqual(chapters.find((c) => c.title === 'Fractions')?.lessons, ['Adding fractions', 'Comparing fractions']);
        assert.deepEqual(chapters.find((c) => c.title === 'Decimals')?.lessons, ['Reading decimals'], 'the removed lesson is not listed');

        await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#collapse-all').click()]);
        assert.equal((await tab.page.locator('a#collapse-all').innerText()).trim(), t('collapseAll'));
        assert.deepEqual((await chaptersOn(tab.page)).map((c) => c.open), [false, false, false, false, false], 'Collapse all folds all');

        await go(tab.page, w, subjectPath(s, s.arabic));
        const grammar = await chaptersOn(tab.page);
        assert.deepEqual(grammar.map((c) => c.title), ['Nouns', 'Verbs', 'Particles']);
        assert.deepEqual(grammar.map((c) => c.open), [true, true, true], 'three chapters: all open');
        assert.equal(await tab.page.locator('a#expand-all, a#collapse-all').count(), 0, 'no Expand all or Collapse all');

        await go(tab.page, w, subjectPath(s, s.reading));
        assert.deepEqual((await chaptersOn(tab.page)).map((c) => [c.title, c.open, c.lessons]), [['Books', true, ['First book']]]);
        await tab.ctx.close();
      });
    }
  }
});
