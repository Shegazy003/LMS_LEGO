// UX-8 (ux-plan v2, LMS wave 1, L1): the activity notice, full once then
// folded. Full: a card with the sentence, the detail and "Got it" (a real
// button, 44 px). Folded: one line in body text size with "What is recorded"
// as a <details> disclosure; never smaller than 14 px, contrast at least
// 4.5:1, never only an icon. Both forms sit in the same place in the reading
// order: the element just before the notice is the same in both (the greeting
// on the home, the lesson title block on a lesson). Screenshots
// UX-8-phone-ar-full, UX-8-phone-ar-folded, UX-8-phone-en-folded, UX-8-desktop-ar-folded.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { SALMA, activity, browserAs, go, home, lessonPath, uxShot, wave1World, words, type Wave1World, type Width } from './world.ts';
import { measure } from './ux.ts';

const placeBefore = (page: Page) => page.evaluate(() => {
  const n = document.querySelector('#notice-card, #notice-line')!;
  return n.previousElementSibling?.id ?? '';
});

describe('UX-8 notice full once then folded', { concurrency: false }, () => {
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

  for (const [width, lang] of [['phone', 'ar'], ['phone', 'en'], ['desktop', 'ar']] as [Width, 'ar' | 'en'][]) {
    it(`${width} ${lang}: full on the home first, then folded on the home and on a lesson, in the same place`, async () => {
      const t = words('school', lang);
      const s = w.school;
      const tab = await browserAs(browser, w, SALMA, { lang, width });
      await go(tab.page, w, home(s));
      assert.equal(await tab.page.locator('#notice-card').count(), 1, 'the full card first');
      const button = tab.page.locator('#notice-card button#notice-got-it');
      assert.equal((await button.innerText()).trim(), t('activityGotIt'));
      assert.ok((await button.boundingBox())!.height >= 44, 'Got it is 44 px');
      assert.ok((await tab.page.locator('#notice-card').innerText()).includes(t('activityDetail')), 'the detail in the card');
      const fullBefore = await placeBefore(tab.page);
      assert.equal(fullBefore, 'greeting', 'full: right after the greeting');
      if (width === 'phone' && lang === 'ar') await uxShot(tab.page, 'UX-8-phone-ar-full');

      await go(tab.page, w, home(s));
      assert.equal(await tab.page.locator('#notice-line').count(), 1, 'then the folded line');
      assert.equal(await placeBefore(tab.page), fullBefore, 'folded: in the same place (after the greeting)');
      const line = (await measure(tab.page, '#notice-line #activity-notice, #notice-line summary'));
      for (const m of line) {
        assert.ok(m.fontPx >= 14, `"${m.text}": ${m.fontPx} px is 14 px or more`);
        assert.ok(m.contrast >= 4.5, `"${m.text}": contrast ${m.contrast.toFixed(2)} is 4.5:1 or more`);
      }
      const body = await tab.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main')!).fontSize));
      assert.equal(line[0].fontPx, body, 'the folded line is in body text size');
      assert.equal((await tab.page.locator('#notice-line details#notice-more > summary').innerText()).trim(), t('activityWhatTitle'), 'a worded disclosure, not an icon');
      const oneLine = await tab.page.locator('#notice-line').evaluate((el) => !el.classList.contains('card') && getComputedStyle(el).borderTopStyle === 'none');
      assert.ok(oneLine, 'a line, not a card');
      if (lang === 'en' || width === 'desktop') await uxShot(tab.page, `UX-8-${width}-${lang}-folded`);
      else await uxShot(tab.page, 'UX-8-phone-ar-folded');

      await go(tab.page, w, lessonPath(s, s.lessons['Comparing fractions']));
      assert.equal(await tab.page.locator('#notice-line').count(), 1, 'folded on a lesson too');
      assert.equal(await placeBefore(tab.page), 'lesson-head', 'after the lesson title block');
      await tab.ctx.close();
    });
  }

  it('a lesson that is the first page told: full there, after the lesson title block', async () => {
    const tab = await browserAs(browser, w, SALMA, { lang: 'ar' });
    await go(tab.page, w, lessonPath(w.school, w.school.lessons['Adding fractions']));
    assert.equal(await tab.page.locator('#notice-card').count(), 1);
    assert.equal(await placeBefore(tab.page), 'lesson-head');
    await tab.ctx.close();
  });
});

