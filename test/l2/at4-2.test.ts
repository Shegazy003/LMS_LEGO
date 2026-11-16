// AT-4.2 (product-contract v2, LMS wave 1, L2, section 8.1): with activity off
// the guardian home shows no activity line, date or phrase (as today). With
// activity on, each card adds "Last opened: <lesson title> · <date>", identical
// to the newest row of Mona's activity page for that learner, beside the
// existing link to that page: for Salma "Reading decimals", then "Comparing
// fractions" after "Reading decimals" is removed, never "Adding fractions"
// (opened before the link day). For Youssef "Last opened: No open recorded".
// After the link to Youssef ends, his card is gone.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { activityIn } from '../at13/pages.ts';
import {
  SALMA, YOUSSEF, activityPage, go, guardianCards, guardianTab, l2World, linkedHome, newestActivityRow, unlinkThrough, words, type GuardianCardSeen, type L2World,
} from './world.ts';
import type { Page } from 'playwright';

/** What the home shows outside the result line: no activity phrase, date or number while off. */
async function noActivity(page: Page, cards: GuardianCardSeen[], where: string): Promise<void> {
  for (const c of cards) {
    assert.equal(c.lastOpened, null, `${where}, ${c.name}: no activity line`);
    assert.equal(c.activityHref, null, `${where}, ${c.name}: no link to the activity page`);
  }
  const rest = await page.evaluate(() => {
    const main = document.querySelector('main')!.cloneNode(true) as HTMLElement;
    main.querySelectorAll('.latest-result').forEach((e) => e.remove());
    return main.innerText;
  });
  assert.deepEqual(activityIn(rest), [], `${where}: no activity phrase, date or count`);
}

describe('AT-4.2 Last opened on the guardian home is the activity page\'s newest row, only while activity is on', { concurrency: false }, () => {
  let w: L2World;
  let browser: Browser;
  before(async () => {
    w = await l2World({ story: true });
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: activity on, Salma's Last opened is Reading decimals (the newest row of her activity page), Youssef's is No open recorded, beside the link`, async () => {
      const t = words('school', lang);
      const tab = await guardianTab(browser, w, lang);
      await go(tab.page, w, linkedHome(w.school));
      const cards = await guardianCards(tab.page);
      assert.deepEqual(cards.map((c) => c.name), [SALMA.display_name, YOUSSEF.display_name]);
      const marked = await tab.page.locator('.last-opened').evaluateAll((els) => els.map((e) => e.closest('[data-activity]') !== null));
      assert.deepEqual(marked, [true, true], 'each activity piece carries data-activity');
      for (const card of cards) {
        assert.equal(card.activityHref, activityPage(w.school, card.learnerId), `${card.name}: the existing link to the activity page`);
        await go(tab.page, w, activityPage(w.school, card.learnerId));
        const newest = await newestActivityRow(tab.page);
        assert.equal(card.lastOpened, newest ? t('lastOpenedLine', { title: newest.title, date: newest.date }) : t('lastOpenedNone'), `${card.name}: the activity page's newest row`);
      }
      assert.equal(cards[0].lastOpened, t('lastOpenedLine', { title: 'Reading decimals', date: w.days[2] }));
      if (lang === 'en') {
        assert.equal(cards[0].lastOpened, `Last opened: Reading decimals · ${w.days[2]}`);
        assert.equal(cards[1].lastOpened, 'Last opened: No open recorded');
      }
      assert.ok(!cards[0].text.includes('Adding fractions'), 'never Adding fractions, opened before the link day');
      await tab.ctx.close();
    });
  }

  it('after "Reading decimals" is removed, Salma\'s line is Comparing fractions, still the activity page\'s newest row; never Adding fractions', async () => {
    await w.p.sql(`UPDATE lesson SET removed_at = 2 WHERE id = '${w.school.lessons['Reading decimals']}'`);
    const t = words('school', 'en');
    const tab = await guardianTab(browser, w, 'en');
    await go(tab.page, w, linkedHome(w.school));
    const [salma] = await guardianCards(tab.page);
    await go(tab.page, w, activityPage(w.school, salma.learnerId));
    const newest = await newestActivityRow(tab.page);
    assert.deepEqual(newest, { title: 'Comparing fractions', date: w.days[1] });
    assert.equal(salma.lastOpened, t('lastOpenedLine', { title: 'Comparing fractions', date: w.days[1] }));
    assert.equal(salma.lastOpened, `Last opened: Comparing fractions · ${w.days[1]}`);
    await tab.ctx.close();
  });

  it('with activity off the home shows no activity line, date or phrase, in Arabic and English', async () => {
    const admin = await w.adminNow();
    assert.equal((await admin.post(`/s/${w.school.id}/admin/activity/off`, {})).status, 303, 'activity off');
    for (const lang of ['ar', 'en'] as const) {
      const tab = await guardianTab(browser, w, lang);
      await go(tab.page, w, linkedHome(w.school));
      const cards = await guardianCards(tab.page);
      assert.equal(cards.length, 2);
      await noActivity(tab.page, cards, `${lang} off`);
      await tab.ctx.close();
    }
    assert.equal((await admin.post(`/s/${w.school.id}/admin/activity`, { told: '1' })).status, 303, 'on again');
  });

  it('after Mona\'s link to Youssef ends, his card is gone', async () => {
    await unlinkThrough(await w.adminNow(), w.school.id, w.mona, w.ids[YOUSSEF.username]);
    const tab = await guardianTab(browser, w, 'en');
    await go(tab.page, w, linkedHome(w.school));
    const cards = await guardianCards(tab.page);
    assert.deepEqual(cards.map((c) => c.name), [SALMA.display_name]);
    assert.ok(!(await tab.page.locator('main').innerText()).includes(YOUSSEF.display_name), 'nothing of Youssef remains');
    await tab.ctx.close();
  });
});
