// AT-1.3 (product-contract v2, LMS wave 1, L1, section 4.1 empty states):
// Science club (no chapters) shows its title, teacher line and "No <lessons>
// here yet." with no Start link; Youssef (assigned nothing) sees only the
// greeting, the top navigation and today's "Nothing has been assigned to you yet.".
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, YOUSSEF, browserAs, go, home, subjectPath, wave1World, words, type Wave1World } from './world.ts';
import { cardsOn } from './home.ts';

describe('AT-1.3 the empty subject card and the home with nothing assigned', { concurrency: false }, () => {
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
    assert.equal(t('noLessonsYet'), 'No lessons here yet.');
    assert.equal(t('nothingAssigned'), 'Nothing has been assigned to you yet.');
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: Science club: title, teacher line, "No <lessons> here yet.", no Start link`, async () => {
      const t = words('school', lang);
      const tab = await browserAs(browser, w, SALMA, { lang });
      await go(tab.page, w, home(w.school));
      const card = (await cardsOn(tab.page)).find((c) => c.title === 'Science club');
      assert.ok(card, 'Science club has a card');
      assert.equal(card.teacher, t('teacherLine', { publisher: t('publisher'), name: 'Shimaa' }));
      assert.equal(card.none, t('noLessonsYet'));
      assert.equal(card.start, null, 'no Start link');
      assert.deepEqual(card.links, [subjectPath(w.school, w.school.science)], 'only the title link');
      assert.equal(card.count, null, 'no count beside the sentence');
      await tab.ctx.close();
    });

    it(`${lang}: Youssef: the greeting, the top navigation and "Nothing has been assigned to you yet." only`, async () => {
      const t = words('school', lang);
      const tab = await browserAs(browser, w, YOUSSEF, { lang });
      await go(tab.page, w, home(w.school));
      assert.equal(await tab.page.locator('nav#top-nav').count(), 1, 'the top navigation');
      const parts = await tab.page.locator('main > *').evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
      assert.deepEqual(parts, [t('welcome', { name: YOUSSEF.display_name }), t('nothingAssigned')]);
      assert.equal(await tab.page.locator('#my-list').count(), 0, 'no card list');
      await tab.ctx.close();
    });
  }
});
