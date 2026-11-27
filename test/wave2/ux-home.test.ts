// LMS wave 2, W2-2 (product-contract v2 on PIL-225, section 8; ux-plan v2,
// UX-34 and UX-35): the learner home's "Continue where you stopped" area and
// the started cards, in a real browser: place, states, sizes, card actions,
// keyboard order, widths, Arabic and kit words. One describe per UX item, each
// its own CI step (`UX-<n> ...`), each on a fresh world. Screenshots go to
// evidence/ux/ as the ux-plan names them.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI } from '../../src/i18n/ui.ts';
import { wordsOnly } from '../l2/pages.ts';
import { LONG_LESSON, MIXED_TITLE, longTitles } from '../wave1/pages.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import {
  MATH_ORDER, SALMA, T1, T2, as, browserAs, home, markClock, press, uxShot, wave2World, words, type SpaceIds, type Wave1World,
} from './world.ts';

const LANGS = ['ar', 'en'] as const;
/** The ui.ts keys W2-2 added, and the done line the started card shows (UX-35's language and deny-list checks). */
const W2_2_KEYS = ['continueHeading', 'continueFirst', 'continueLink', 'everythingDone', 'readAgain'] as const;
const CARD_LINE_KEYS = ['doneProgress', 'allDone', 'doneCount'] as const;
/** The ux-plan's deny list (Wording): whole Arabic words that read as gendered second person or a demonstrative. */
const DENY = ['توقفت', 'بدأت', 'بدأته', 'أنت', 'لك', 'عليك', 'هذا', 'هذه'];
const bare = (s: string) => s.replace(/[ً-ْٰـ]/g, '');

async function mark(w: Wave1World, s: SpaceIds, titles: string[], at = T1): Promise<void> {
  const salma = await as(w, SALMA, 'en');
  for (const [i, title] of titles.entries()) {
    await markClock(w, at + i * 1000);
    assert.equal((await press(salma, s, s.lessons[title], 'done')).status, 303, `${title} marked`);
  }
  await markClock(w, null);
}

interface HomeFacts {
  order: string[];
  heading: string;
  labelled: boolean;
  links: number;
  lines: string[];
  cards: { subject: string; count: string; actions: string[]; links: number; started: boolean }[];
}

/** What the home shows around the continue area, read in the page. */
function homeFacts(page: Page): Promise<HomeFacts> {
  return page.evaluate(() => {
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('main') ?? document.body;
    const order = [...main.querySelectorAll('#greeting, #notice-card, #notice-line, #continue, #my-list, #nothing-yet, main > h2, #continue ~ h2')]
      .map((e) => e.id || e.tagName.toLowerCase());
    const area = document.getElementById('continue');
    const heading = document.getElementById('continue-heading');
    return {
      order: [...new Set(order)],
      heading: clean(heading?.textContent),
      labelled: area?.tagName === 'SECTION' && area.getAttribute('aria-labelledby') === 'continue-heading' && heading?.tagName === 'H2',
      links: area?.querySelectorAll('a, button').length ?? -1,
      lines: [...(area?.querySelectorAll('p') ?? [])].map((p) => clean(p.textContent)),
      cards: [...document.querySelectorAll<HTMLElement>('#my-list > li')].map((li) => ({
        subject: li.dataset.subject ?? '',
        count: clean(li.querySelector('.count')?.textContent),
        // LMS redesign R1a (UX-1 row, UX-99): the action shows «ابدأ» / «تابع»; its accessible name says the lesson.
        actions: [...li.querySelectorAll('a.start')].map((a) => clean(a.getAttribute('aria-label') ?? (a as HTMLElement).innerText)),
        // Title and action; the latest-announcement line (UX-55 row) is its own link and not counted here.
        links: [...li.querySelectorAll('a')].filter((a) => !a.closest('.ann')).length,
        started: li.querySelector('[data-action]') !== null,
      })),
    };
  });
}

/** The words of a key without its {placeholders}, for the language check (data, "PDF" and the space's name are outside them). */
const fixedParts = (lang: 'ar' | 'en', keys: readonly string[]) =>
  keys.flatMap((k) => UI[lang][k as keyof typeof UI.en].split(/\{[^}]+\}/).map((x) => x.replace(/[:"،.]/g, '').trim()).filter((x) => x.length > 1));

// ------------------------------------------------------------------- UX-34 ----

describe('UX-34 continue area states and card actions', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave2World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-34 first time: a section named by its heading, after the greeting and before the cards, one line and no link; screenshots', async () => {
    for (const lang of LANGS) {
      const t = words('school', lang);
      const { ctx, page } = await browserAs(browser, w, SALMA, { lang });
      await page.goto(w.p.url + home(w.school));
      const f = await homeFacts(page);
      assert.ok(f.labelled, `${lang}: a <section> named by its <h2> heading`);
      assert.equal(f.heading, t('continueHeading'));
      assert.equal(await page.getByRole('region', { name: t('continueHeading') }).count(), 1, `${lang}: one region named "${t('continueHeading')}"`);
      // LMS redesign R1a (UX-34 row): greeting, the hero, (the due strip,) then the cards.
      assert.deepEqual(f.order.slice(0, 3), ['greeting', 'continue', 'my-list'], `${lang}: greeting, the area, then the cards`);
      assert.equal(f.links, 0, `${lang}: no link`);
      assert.deepEqual(f.lines, [t('continueFirst', { lesson: t('lesson').toLocaleLowerCase(lang) })], `${lang}: the one line`);
      assert.ok(f.cards.every((c) => !c.started && c.actions.length <= 1), `${lang}: every card as today`);
      await uxShot(page, `UX-34-phone-${lang}-first`);
      await ctx.close();
    }
  });

  // LMS redesign R1a (UX-34 row, UX-97): the hero's «subject · chapter» kicker, the lesson title and the progress, then one
  // button-styled link of 44 px or more (the chapter moved from the link's second line to the kicker).
  it('UX-34 has a target: subject, progress, one button-styled link of 48 px or more with the chapter on a second line; started and unstarted cards; standard screenshot set', async () => {
    await mark(w, w.school, MATH_ORDER.slice(0, 2));
    await mark(w, w.company, MATH_ORDER.slice(0, 2));
    for (const [width, lang, kit] of [['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company']] as const) {
      const s = kit === 'company' ? w.company : w.school;
      const t = words(kit, lang);
      const { ctx, page } = await browserAs(browser, w, SALMA, { lang, width });
      await page.goto(w.p.url + home(s));
      const f = await homeFacts(page);
      const what = `${width} ${lang} ${kit}`;
      assert.equal(f.links, 1, `${what}: one link in the area`);
      assert.deepEqual(f.lines.slice(0, 3), [
        t('heroLesson', { subjectTitle: 'Mathematics', chapterTitle: 'Decimals' }), 'Reading decimals', t('doneProgress', { n: '2', total: '5', count: t('doneCount', { n: '5' }) }),
      ], `${what}: the kicker, the lesson, then the progress`);
      const link = page.locator('#continue a');
      const [box] = await measure(page, '#continue a');
      assert.ok(box.height >= 44, `${what}: the link is ${box.height}px tall (44 or more, UX-97)`);
      const style = await link.evaluate((a) => {
        const cs = getComputedStyle(a);
        return { bg: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius) };
      });
      assert.ok(!/rgba\(0, 0, 0, 0\)|transparent/.test(style.bg) && style.radius > 0, `${what}: button-styled (${style.bg}, radius ${style.radius})`);
      assert.equal((await link.innerText()).replace(/\s+/g, ' ').trim(), t('continueLink', { title: 'Reading decimals' }), `${what}: the link says Continue: Reading decimals`);
      for (const m of await measure(page, '#continue p, #continue a span')) {
        assert.ok(m.fontPx >= 14, `${what}: ${m.text} ${m.fontPx}px`);
        assert.ok(m.contrast >= 4.5, `${what}: ${m.text} contrast ${m.contrast.toFixed(2)}`);
      }
      // Cards: one action each; Mathematics started ("Done" and "Continue"), the others as today ("Start").
      for (const c of f.cards) {
        assert.ok(c.actions.length <= 1 && c.links <= 2, `${what} ${c.subject}: one action (and the title link)`);
        if (c.subject === s.math) {
          assert.ok(c.started, `${what}: Mathematics is started`);
          assert.equal(c.actions[0], t('cardContinueName', { title: 'Reading decimals' }), `${what}: Continue: Reading decimals`);
        } else if (c.actions.length) {
          assert.ok(!c.started && c.actions[0].startsWith(t('startLesson', { title: '' }).trim()), `${what} ${c.subject}: Start, as today`);
        }
      }
      for (const m of await measure(page, '#my-list a.start')) assert.ok(m.height >= 44 && m.width >= 44, `${what}: card button ${m.width}×${m.height}px (UX-99: 44 × 44 or more)`);
      await uxShot(page, `UX-34-${width}-${lang}${kit === 'company' ? '-company' : ''}`);
      await ctx.close();
    }
  });

  it('UX-34 everything started is done: one line, no link; the card says "Read again: <first lesson>"; screenshot', async () => {
    await mark(w, w.school, MATH_ORDER.slice(2), T2);
    const t = words('school', 'ar');
    const { ctx, page } = await browserAs(browser, w, SALMA, { lang: 'ar' });
    await page.goto(w.p.url + home(w.school));
    const f = await homeFacts(page);
    assert.equal(f.links, 0, 'no link');
    assert.deepEqual(f.lines, [t('everythingDone')], 'the one line');
    const math = f.cards.find((c) => c.subject === w.school.math)!;
    assert.deepEqual(math.actions, [t('readAgain', { title: 'Adding fractions' })], 'Read again: the first lesson');
    assert.equal(math.count, t('allDone', { total: '5', count: '' }), 'All done: 5 lessons');
    await uxShot(page, 'UX-34-phone-ar-alldone');
    await ctx.close();
  });
});

// ------------------------------------------------------------------- UX-35 ----

describe('UX-35 continue area keyboard, widths and language', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave2World();
    await longTitles(w, w.school);
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-35 the deny list holds for every W2-2 Arabic value', () => {
    for (const key of W2_2_KEYS) {
      const found = bare(UI.ar[key]).split(/[^\p{L}]+/u).filter((x) => DENY.includes(x));
      assert.deepEqual(found, [], `${key}: no denied whole word`);
    }
  });

  it('UX-35 Tab order: the top navigation, the continue link, then the cards in order', async () => {
    await mark(w, w.school, ['Adding fractions']);
    for (const lang of LANGS) {
      const { ctx, page } = await browserAs(browser, w, SALMA, { lang });
      await page.goto(w.p.url + home(w.school));
      const cardLinks = await page.locator('#my-list a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
      const stops: { region: string; id: string; href: string }[] = [];
      for (let i = 0; i < 40; i++) {
        const f = await tab(page);
        const href = await page.evaluate(() => document.activeElement?.getAttribute('href') ?? '');
        stops.push({ region: f.region, id: f.id, href });
        if (href === cardLinks.at(-1)) break;
      }
      const at = stops.findIndex((x) => x.id === 'continue-link');
      assert.ok(at > 0, `${lang}: the continue link is a stop`);
      assert.ok(stops.slice(0, at).some((x) => x.region === 'top-nav'), `${lang}: the top navigation comes first`);
      assert.ok(stops.slice(0, at).every((x) => x.region !== 'cards'), `${lang}: no card before the continue link`);
      // LMS redesign R1a (UX-34 row): the due strip (#todo) sits between the hero and the cards.
      const stripLinks = await page.locator('#todo a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
      const after = stops.slice(at + 1).map((x) => x.href);
      assert.deepEqual(after.slice(0, stripLinks.length), stripLinks, `${lang}: then the due strip's links`);
      assert.deepEqual(after.slice(stripLinks.length), cardLinks, `${lang}: then the cards' links, in order`);
      await ctx.close();
    }
  });

  for (const lang of LANGS) {
    for (const width of [390, 768, 1280, 320]) {
      it(`UX-35 ${lang} ${width} px: no sideways scroll, no clipped text, with a 120-character and a mixed lesson title`, async () => {
        const s = w.school;
        const { ctx, page } = await browserAs(browser, w, SALMA, { lang });
        await page.setViewportSize({ width, height: 844 });
        // The target is the 120-character "Comparing fractions" (after Adding fractions), then the mixed "Reading decimals".
        for (const [titles, target] of [[['Adding fractions'], LONG_LESSON], [['Comparing fractions'], MIXED_TITLE]] as const) {
          await mark(w, s, [...titles], T2 + 10_000);
          await page.goto(w.p.url + home(s));
          const line1 = (await page.locator('#continue .hero-title').innerText()).replace(/\s+/g, ' '); // R1a (UX-97): the hero's lesson title
          assert.ok(line1.includes(target.slice(0, 40)), `the target in the area: ${target.slice(0, 20)}...`);
          const o = await overflow(page);
          assert.ok(o.sideways <= 0, `${lang} ${width}: no sideways scroll (${o.sideways} px)`);
          assert.deepEqual(o.clipped, [], `${lang} ${width}: no text overflows its box`);
        }
        await ctx.close();
        // Back to one mark for the next width.
        const salma = await as(w, SALMA, 'en');
        assert.equal((await press(salma, s, s.lessons['Comparing fractions'], 'not-done')).status, 303);
      });
    }
  }

  it('UX-35 lang and dir, language check by key, and the kit words in three kits and two languages; screenshot', async () => {
    // First time in the Company and University kits: the line names the kit's lesson word.
    for (const lang of LANGS) {
      for (const sp of [w.company, w.university]) {
        const t = words(sp.kit, lang);
        const c = await as(w, SALMA, lang);
        const doc = await (await c.get(home(sp))).text();
        const line = doc.match(/<p id="continue-state"[^>]*>([\s\S]*?)<\/p>/)?.[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
        assert.equal(line, t('continueFirst', { lesson: t('lesson').toLocaleLowerCase(lang) }), `${sp.kit} ${lang}: the first-time line`);
        assert.ok(line!.includes(t('lesson').toLocaleLowerCase(lang)), `${sp.kit} ${lang}: with the kit's lesson word "${t('lesson')}"`);
      }
    }
    for (const sp of [w.company, w.university]) await mark(w, sp, ['Adding fractions']);
    for (const lang of LANGS) {
      const other = lang === 'ar' ? 'en' : 'ar';
      const foreign = fixedParts(other, [...W2_2_KEYS, ...CARD_LINE_KEYS]);
      for (const sp of [w.school, w.company, w.university]) {
        const t = words(sp.kit, lang);
        const { ctx, page } = await browserAs(browser, w, SALMA, { lang });
        await page.goto(w.p.url + home(sp));
        assert.deepEqual([await page.getAttribute('html', 'lang'), await page.getAttribute('html', 'dir')], [lang, lang === 'ar' ? 'rtl' : 'ltr'], `${sp.kit} ${lang}: lang and dir`);
        const text = await wordsOnly(page);
        for (const x of foreign) assert.ok(!text.includes(x), `${sp.kit} ${lang}: no ${other} words "${x}"`);
        // Titles inside the area's sentences are isolated.
        assert.ok(await page.locator('#continue .hero-title bdi').count() >= 1, `${sp.kit} ${lang}: the lesson title is in <bdi>`);
        // The started card's count line and the area's progress carry the kit's plural lesson word.
        const math = (await homeFacts(page)).cards.find((c) => c.subject === sp.math)!;
        assert.ok(math.count.includes(t('lessonPlural')), `${sp.kit} ${lang}: the card says "${t('lessonPlural')}" (${math.count})`);
        if (lang === 'en') {
          assert.equal(math.count, { school: 'Done: 1 of 5 lessons', company: 'Done: 1 of 5 sessions', university: 'Done: 1 of 5 lectures' }[sp.kit]);
        }
        assert.ok((await page.locator('#continue-progress').innerText()).includes(t('lessonPlural')), `${sp.kit} ${lang}: the area's progress`);
        if (sp.kit === 'company' && lang === 'ar') await uxShot(page, 'UX-35-phone-ar-company');
        await ctx.close();
      }
    }
  });
});
