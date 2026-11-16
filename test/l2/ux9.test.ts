// UX-9 (ux-plan v2 on PIL-210, L2): each linked-learner card has the learner's
// name as its heading, then "Latest result" in a line with the mark as the
// strongest text, exam, subject and date; "Corrected" as a text tag; while
// activity is on, "Last opened: <lesson> · <date>" (or "Last opened: No open
// recorded") and the activity link; then the subjects as today. The result
// line is one link target to the learner page, at least 44 px tall.
// Screenshots: the UX-9 standard set (activity on) and UX-9-phone-ar-off.png.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { signedIn } from '../support/seed.ts';
import { COMPANY_ADMIN, activity, uxShot, type Width } from '../wave1/world.ts';
import { RANIA, SALMA, go, guardianTab, l2World, learnerPage, linkedHome, words, type L2World } from './world.ts';

interface CardLayout {
  order: string[];
  scoreWeight: number;
  scorePx: number;
  otherPx: number[];
  tag: string | null;
  tagIsText: boolean;
  lineHeight: number;
  lineLinks: number;
  lineHref: string | null;
}

async function layoutOf(page: Page, index: number): Promise<CardLayout> {
  return page.locator('#linked > section.card[data-learner]').nth(index).evaluate((card) => {
    const pieces: [string, Element | null][] = [
      ['name', card.querySelector('h2')], ['result', card.querySelector('.latest-result')], ['last-opened', card.querySelector('.last-opened')],
      ['activity-link', card.querySelector('a.activity-link')], ['subjects', card.querySelector('h3')],
    ];
    const present = pieces.filter(([, el]) => el) as [string, Element][];
    const order = [...present].sort(([, a], [, b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map(([n]) => n);
    const line = card.querySelector('.latest-result') as HTMLElement;
    const score = line.querySelector('.score') as HTMLElement | null;
    const others = [...line.querySelectorAll('.exam, .subject, .date, .what')] as HTMLElement[];
    const tag = line.querySelector('.tag') as HTMLElement | null;
    const link = line.tagName === 'A' ? line : line.querySelector('a');
    return {
      order,
      scoreWeight: score ? Number(getComputedStyle(score).fontWeight) : 0,
      scorePx: score ? parseFloat(getComputedStyle(score).fontSize) : 0,
      otherPx: others.map((o) => parseFloat(getComputedStyle(o).fontSize)),
      tag: tag ? tag.innerText.trim() : null,
      tagIsText: tag ? tag.children.length === 0 && !tag.querySelector('img, svg') : false,
      lineHeight: (link as HTMLElement | null)?.getBoundingClientRect().height ?? 0,
      lineLinks: line.tagName === 'A' ? 1 + line.querySelectorAll('a').length : line.querySelectorAll('a').length,
      lineHref: link?.getAttribute('href') ?? null,
    };
  });
}

describe('UX-9 guardian card at a glance', { concurrency: false }, () => {
  let w: L2World;
  let browser: Browser;
  before(async () => {
    w = await l2World({ story: true, kits: true });
    await activity(w, true, await signedIn(w.p.url, COMPANY_ADMIN.username, COMPANY_ADMIN.password), w.company.id);
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  const shots: [Width, 'ar' | 'en', 'school' | 'company'][] = [['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company']];
  for (const [width, lang, kit] of shots) {
    it(`${width} ${lang} ${kit}, activity on: name, Latest result with the mark strongest, Corrected as a text tag, Last opened and the activity link, then the subjects`, async () => {
      const t = words(kit, lang);
      const space = kit === 'school' ? w.school : w.company;
      const tab = await guardianTab(browser, w, lang, { width, who: kit === 'school' ? undefined : RANIA });
      await go(tab.page, w, linkedHome(space));
      const first = await layoutOf(tab.page, 0);
      assert.deepEqual(first.order, ['name', 'result', 'last-opened', 'activity-link', 'subjects'], 'the order of meaning');
      assert.ok(first.scoreWeight >= 700, `the mark is bold (${first.scoreWeight})`);
      assert.ok(first.otherPx.every((px) => first.scorePx > px), `the mark is the largest text of the line (${first.scorePx} > ${first.otherPx.join(', ')})`);
      assert.equal(first.tag, t('correctedTag'), 'Corrected as a tag');
      assert.ok(first.tagIsText, 'the tag is text, not an icon');
      assert.equal(first.lineLinks, 1, 'the result line is one link target');
      assert.equal(first.lineHref, learnerPage(space, w.ids[SALMA.username]), 'to the learner page');
      assert.ok(first.lineHeight >= 44, `at least 44 px tall (${first.lineHeight})`);
      await uxShot(tab.page, `UX-9-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
      await tab.ctx.close();
    });
  }

  it('phone ar, activity off: no activity line, the subjects follow the result line (UX-9-phone-ar-off.png)', async () => {
    await activity(w, false, await w.adminNow());
    const tab = await guardianTab(browser, w, 'ar', { width: 'phone' });
    await go(tab.page, w, linkedHome(w.school));
    const first = await layoutOf(tab.page, 0);
    assert.deepEqual(first.order, ['name', 'result', 'subjects']);
    await uxShot(tab.page, 'UX-9-phone-ar-off');
    await tab.ctx.close();
  });
});
