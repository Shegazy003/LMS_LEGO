// AT-3.1 (product-contract v2, LMS wave 1, L1, section 7.1): the first page
// that shows the notice to Salma on browser A shows it in full; every later
// page on A shows the folded one-line form, which still holds the exact
// activityNotice sentence (so AT-15f keeps passing) and a "What is recorded"
// disclosure that opens the full text without a request.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, activity, as, browserAs, go, home, lessonPath, plain, wave1World, words, type Wave1World } from './world.ts';
import { noticeForm, sentencesOf, switchUser } from './notice.ts';

describe('AT-3.1 the notice in full on the first page, then folded with the same sentence and What is recorded', { concurrency: false }, () => {
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

  it('the English detail sentence is exactly the contract\'s', () => {
    const t = words('school', 'en');
    assert.equal(t('activityDetail'), 'Only the date you last opened each Lesson is kept: no time, no count, no duration. Your Administrator switched this on and can tell you more.');
    assert.equal(t('activityWhatTitle'), 'What is recorded');
    assert.equal(t('activityGotIt'), 'Got it');
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: home in full, then lesson, home and after signing out and in folded`, async () => {
      const t = words('school', lang);
      const a = await as(w, SALMA, lang);
      const s = w.school;
      const seen: string[] = [];
      for (const path of [home(s), lessonPath(s, s.lessons['Adding fractions']), home(s), 'signout', home(s), lessonPath(s, s.lessons['Reading decimals'])]) {
        if (path === 'signout') {
          await switchUser(a, SALMA);
          continue;
        }
        const html = await (await a.get(path)).text();
        const form = noticeForm(html);
        seen.push(form ?? 'none');
        assert.deepEqual(sentencesOf(html), [t('activityNotice')], `${path}: the exact AT-15f sentence, once`);
        const text = plain(html);
        assert.ok(text.includes(t('activityDetail')), `${path}: the detail is on the page (no request needed to read it)`);
        if (form === 'full') {
          assert.match(html, /<button[^>]*id="notice-got-it"[^>]*>/, 'Got it is a real button');
          assert.ok(text.includes(t('activityGotIt')));
        } else {
          const disclosure = html.match(/<details id="notice-more"[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/);
          assert.ok(disclosure, `${path}: a What is recorded disclosure`);
          assert.equal(plain(disclosure[1]), t('activityWhatTitle'));
          assert.ok(plain(disclosure[2]).includes(t('activityDetail')), 'the detail inside it');
        }
      }
      assert.deepEqual(seen, ['full', 'folded', 'folded', 'folded', 'folded']);
    });
  }

  it('in a browser: What is recorded opens the detail without any request, and Got it folds the card in place', async () => {
    await activity(w, false);
    await activity(w, true);
    const t = words('school', 'ar');
    const tab = await browserAs(browser, w, SALMA, { lang: 'ar' });
    await go(tab.page, w, home(w.school));
    assert.equal(await tab.page.locator('#notice-card').count(), 1, 'the full card first');
    const requests: string[] = [];
    tab.page.on('request', (r) => requests.push(r.url()));
    await tab.page.locator('#notice-got-it').click();
    assert.equal(await tab.page.locator('#notice-card').count(), 0, 'Got it folds the card');
    assert.equal(await tab.page.locator('#notice-line').count(), 1, 'into the one-line form, in place');
    await go(tab.page, w, home(w.school));
    requests.length = 0;
    assert.equal(await tab.page.locator('#notice-more').evaluate((d) => (d as HTMLDetailsElement).open), false);
    await tab.page.locator('#notice-more > summary').click();
    assert.ok(await tab.page.locator('#activity-detail').isVisible(), 'the detail shows');
    assert.equal((await tab.page.locator('#activity-detail').innerText()).trim(), t('activityDetail'));
    assert.deepEqual(requests, [], 'without a request');
    await tab.ctx.close();
  });
});
