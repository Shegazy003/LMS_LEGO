// UX-1 (ux-plan v2, LMS wave 1, L1): the learner home is a set of subject
// cards. Each card: title (a link, heading level 2), the teacher line when
// there is a publisher, the lesson count, and "Start: <title>" as its one
// primary action (button style, at least 44 px tall); no second lesson link;
// titles from data in <bdi>. Phone: cards stack full width; tablet: two
// columns; desktop: up to three, content width capped for reading.
// Screenshots: the standard set, plus UX-1-phone-ar-university.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SALMA, browserAs, go, home, uxShot, wave1World, type Wave1World, type Width } from './world.ts';
import { cardsOn } from './home.ts';

const COLUMNS: Record<Width, number> = { phone: 1, tablet: 2, desktop: 3 };

describe('UX-1 learner home cards', { concurrency: false }, () => {
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

  const shots: [Width, 'ar' | 'en', 'school' | 'company' | 'university'][] = [
    ['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company'], ['phone', 'ar', 'university'],
  ];
  for (const [width, lang, kit] of shots) {
    it(`${width} ${lang} ${kit}: heading level 2 titles, one Start button of 44 px, bdi titles, ${COLUMNS[width]} column(s)`, async () => {
      const tab = await browserAs(browser, w, SALMA, { lang, width });
      await go(tab.page, w, home(w[kit]));
      const cards = await cardsOn(tab.page);
      assert.ok(cards.length >= 2);
      for (const c of cards) {
        assert.equal(c.headingLevel, 'H2', `${c.title}: heading level 2`);
        assert.ok(c.titleHref, `${c.title}: the title is a link`);
        assert.ok(c.links.filter((h) => h.includes('/read/')).length <= 1, `${c.title}: no second lesson link`);
      }
      const starts = await tab.page.locator('#my-list a.start').evaluateAll((els) => els.map((e) => {
        const cs = getComputedStyle(e);
        return { h: e.getBoundingClientRect().height, bg: cs.backgroundColor, bdi: e.querySelectorAll('bdi').length, display: cs.display, word: (e as HTMLElement).innerText.trim(), label: e.getAttribute('aria-label'), text: e.getAttribute('aria-label') ?? (e as HTMLElement).innerText };
      }));
      for (const s of starts) {
        // The rendered text keeps the space after the colon (a flex button once dropped it: "Start:Adding fractions").
        assert.match(s.text, /^\S[^:]*: \S/, `Start reads "<word>: <title>" with its space (${s.text})`);
        assert.ok(s.h >= 44, `Start is at least 44 px tall (${s.h})`);
        assert.ok(s.bg !== 'rgba(0, 0, 0, 0)' && s.bg !== 'transparent', 'Start has a button style (a filled background)');
        // LMS redesign R1a (UX-1 row, look only; UX-99): the button shows the word, and its accessible name is
        // "<word>: <title>", starting with the visible word; with no accessible name the title is in <bdi>, as before.
        if (s.label) assert.ok(s.label.startsWith(s.word), `the accessible name starts with the visible word (${s.word})`);
        else assert.equal(s.bdi, 1, 'the lesson title in Start is in <bdi>');
      }
      assert.equal(await tab.page.locator('#my-list h2 a bdi').count(), cards.length, 'each subject title is in <bdi>');
      const lefts = await tab.page.locator('#my-list > li').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
      const columns = new Set(lefts).size;
      assert.equal(columns, Math.min(COLUMNS[width], cards.length), `${COLUMNS[width]} column(s) at ${width}`);
      if (width === 'phone') {
        const { list, card } = await tab.page.evaluate(() => ({
          list: document.querySelector('#my-list')!.getBoundingClientRect().width,
          card: document.querySelector('#my-list > li')!.getBoundingClientRect().width,
        }));
        assert.ok(card >= list - 1, 'phone: each card is full width');
      }
      if (width === 'desktop') {
        const main = await tab.page.evaluate(() => document.querySelector('main')!.getBoundingClientRect().width);
        // LMS redesign R1a (UX-105): from 960 px the content runs up to 1120 px (was 1100).
        assert.ok(main <= 1120, `desktop: the content width is capped (${main})`);
      }
      await uxShot(tab.page, `UX-1-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
      await tab.ctx.close();
    });
  }
});
