// AT-1.5 (product-contract v2, LMS wave 1, L1): the card's words come from the
// space's kit. In the Company kit the card says "Trainer" and "Session"; in
// the University kit "Lecturer" and "Lecture"; no School word appears in
// either. The lesson count of more than one uses the release 2 kit word
// "lessons", which is the same in the three seed kits (contract 4.2 and A10),
// so the singular kit word shows on the one-lesson card ("1 session"). The
// label guard (test/guards/no-hardcoded-labels.test.ts) runs in this step too.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { SEED_KITS } from '../../src/kits/seed.ts';
import { hasWord } from '../support/browser.ts';
import { SALMA, browserAs, go, home, lessonPath, wave1World, words, type Wave1World } from './world.ts';
import { cardsOn, countText } from './home.ts';
import '../guards/no-hardcoded-labels.test.ts';

/** The School kit's words that this kit does not share (a word both kits use, such as وحدة, says nothing). */
function schoolOnly(kit: 'company' | 'university', lang: 'ar' | 'en'): string[] {
  const school = Object.values(SEED_KITS.find((k) => k.seed === 'school')!.labels[lang]);
  const own = new Set(Object.values(SEED_KITS.find((k) => k.seed === kit)!.labels[lang]));
  return school.filter((word) => !own.has(word));
}

describe('AT-1.5 Company and University cards say their own kit\'s words and no School word', { concurrency: false }, () => {
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

  it('the kits\' words are the contract\'s: Trainer and Session, Lecturer and Lecture', () => {
    assert.equal(words('company', 'en')('publisher'), 'Trainer');
    assert.equal(words('company', 'en')('lesson'), 'Session');
    assert.equal(words('university', 'en')('publisher'), 'Lecturer');
    assert.equal(words('university', 'en')('lesson'), 'Lecture');
  });

  for (const kit of ['company', 'university'] as const) {
    for (const lang of ['ar', 'en'] as const) {
      it(`${kit} ${lang}: teacher line and counts from the kit; no School word on the home`, async () => {
        const t = words(kit, lang);
        const s = w[kit];
        const tab = await browserAs(browser, w, SALMA, { lang });
        await go(tab.page, w, home(s));
        const cards = Object.fromEntries((await cardsOn(tab.page)).map((c) => [c.title, c]));
        assert.deepEqual(Object.keys(cards), ['Mathematics', 'Reading club']);
        assert.equal(cards.Mathematics.teacher, t('teacherLine', { publisher: t('publisher'), name: 'Hadeer' }));
        assert.ok(cards.Mathematics.teacher?.startsWith(t('publisher')), `the ${kit} publisher word`);
        assert.equal(cards.Mathematics.count, countText(t, 5, lang));
        assert.equal(cards['Reading club'].count, countText(t, 1, lang));
        if (lang === 'en') {
          assert.equal(cards.Mathematics.teacher, kit === 'company' ? 'Trainer: Hadeer' : 'Lecturer: Hadeer');
          assert.equal(cards['Reading club'].count, kit === 'company' ? '1 session' : '1 lecture', 'the kit\'s lesson word');
        }
        assert.equal(cards.Mathematics.start?.href, lessonPath(s, s.lessons['Adding fractions']));
        const text = await tab.page.locator('main').innerText();
        const found = schoolOnly(kit, lang).filter((word) => hasWord(text, word));
        assert.deepEqual(found, [], `no School word on the ${kit} home`);
        await tab.ctx.close();
      });
    }
  }
});
