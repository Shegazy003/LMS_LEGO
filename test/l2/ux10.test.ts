// UX-10 (ux-plan v2 on PIL-210, L2): guardian states. "No results yet." in
// the result line's place; activity on with no open: "Last opened: No open
// recorded"; activity off: no activity line and no empty gap; no linked
// learner: today's message.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { utcDatePlusDays } from '../support/http.ts';
import { G2 } from '../at9/world.ts';
import { activity } from '../wave1/world.ts';
import { YOUSSEF, go, guardianTab, l2World, linkedHome, words, type L2World } from './world.ts';

/** Youssef's card: what follows the heading, and any element of the card that holds no text but takes room. */
async function youssefCard(page: Page, id: string) {
  return page.locator(`#linked > section.card[data-learner="${id}"]`).evaluate((card) => {
    const kids = [...card.children] as HTMLElement[];
    const empty = [...card.querySelectorAll('*')].filter((e) => {
      const el = e as HTMLElement;
      return !el.innerText.trim() && el.getBoundingClientRect().height > 0 && !el.querySelector('img, svg, input');
    }).map((e) => `${e.tagName.toLowerCase()}.${(e as HTMLElement).className}`);
    const line = card.querySelector('.latest-result') as HTMLElement | null;
    return {
      afterHeading: kids[1]?.matches('.latest-result') || Boolean(kids[1]?.querySelector('.latest-result')),
      line: line?.innerText.replace(/\s+/g, ' ').trim() ?? null,
      lastOpened: (card.querySelector('.last-opened') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? null,
      empty,
      gap: (() => {
        const subjects = card.querySelector('h3');
        return line && subjects ? subjects.getBoundingClientRect().top - line.getBoundingClientRect().bottom : -1;
      })(),
    };
  });
}

describe('UX-10 guardian empty and off states', { concurrency: false }, () => {
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
    it(`${lang}: Youssef, activity on: "No results yet." in the result line's place and "Last opened: No open recorded"`, async () => {
      const t = words('school', lang);
      const tab = await guardianTab(browser, w, lang);
      await go(tab.page, w, linkedHome(w.school));
      const y = await youssefCard(tab.page, w.ids[YOUSSEF.username]);
      assert.ok(y.afterHeading, 'the result line comes right after the name');
      assert.equal(y.line, t('resultsNone'));
      assert.equal(y.lastOpened, t('lastOpenedNone'));
      if (lang === 'en') assert.deepEqual([y.line, y.lastOpened], ['No results yet.', 'Last opened: No open recorded']);
      assert.deepEqual(y.empty, [], 'no empty element takes room');
      await tab.ctx.close();
    });
  }

  it('activity off: no activity line and no empty gap between the result line and the subjects', async () => {
    await activity(w, false, await w.adminNow());
    const tab = await guardianTab(browser, w, 'ar');
    await go(tab.page, w, linkedHome(w.school));
    const y = await youssefCard(tab.page, w.ids[YOUSSEF.username]);
    assert.equal(y.lastOpened, null);
    assert.deepEqual(y.empty, []);
    assert.ok(y.gap >= 0 && y.gap <= 24, `the subjects follow the result line closely (${y.gap}px)`);
    assert.equal(await tab.page.locator('#linked [data-activity]').count(), 0, 'nothing about activity');
    await tab.ctx.close();
  });

  it('no linked learner: today\'s message', async () => {
    const admin = await w.adminNow();
    assert.equal((await admin.post(`/s/${w.school.id}/admin/people`, { ...G2, valid_until: utcDatePlusDays(30) })).status, 303, 'a guardian with no link');
    for (const lang of ['ar', 'en'] as const) {
      const tab = await guardianTab(browser, w, lang, { who: G2 });
      await go(tab.page, w, linkedHome(w.school));
      assert.equal((await tab.page.locator('#none-linked').innerText()).trim(), words('school', lang)('guardianNone'));
      assert.equal(await tab.page.locator('#linked section.card').count(), 0, 'no card');
      await tab.ctx.close();
    }
  });
});
