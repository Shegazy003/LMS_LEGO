// LMS wave 2, W2-1b (product-contract v2 on PIL-225, section 5; ux-plan v2,
// UX-28, UX-29, UX-32, UX-33): the ticks and the progress line on a subject's
// outline, the "Done" tag on the lesson page, Arabic and kit words, widths,
// sizes and contrast. One describe per UX item, each its own CI step (`UX-<n> ...`),
// each on a fresh world. Screenshots go to evidence/ux/ as the ux-plan names them.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI } from '../../src/i18n/ui.ts';
import { W2_KEYS } from '../at13/pages.ts';
import { wordsOnly } from '../l2/pages.ts';
import { longTitles } from '../wave1/pages.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import {
  MATH_ORDER, SALMA, as, browserAs, lessonPath, press, salmaThreeMarks, subjectPath, uxShot, wave2World, words, type Wave1World,
} from './world.ts';

const LANGS = ['ar', 'en'] as const;
/** Every ui.ts key W2-1 added (W2-1a and W2-1b), doneCount included (UX-32's language and deny-list checks). */
const ALL_W2_KEYS = [...W2_KEYS, 'doneCount'] as const;
/** The ux-plan's deny list (Wording): whole Arabic words that read as gendered second person or a demonstrative. */
const DENY = ['توقفت', 'بدأت', 'بدأته', 'أنت', 'لك', 'عليك', 'هذا', 'هذه'];

/** Arabic without its diacritics and tatweel. */
const bare = (s: string) => s.replace(/[ً-ْٰـ]/g, '');

interface OutlineFacts {
  ticked: string[];
  chapters: { id: string; lessons: number; ticked: number; chapterTick: boolean }[];
  ticks: { kind: string; hidden: string; glyph: string; control: boolean; focusable: boolean; hiddenVisually: boolean; hiddenFromReaders: boolean }[];
  plainRows: string[];
}

/** What the outline shows of done marks, read in the page. */
function outlineFacts(page: Page): Promise<OutlineFacts> {
  return page.evaluate(() => {
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const ticks = [...document.querySelectorAll<HTMLElement>('[data-done]')].map((t) => {
      const hidden = t.querySelector<HTMLElement>('.sr-only');
      const cs = hidden ? getComputedStyle(hidden) : null;
      const box = hidden?.getBoundingClientRect();
      return {
        kind: t.dataset.done ?? '',
        hidden: clean(hidden?.textContent),
        glyph: clean(t.querySelector('[aria-hidden="true"]')?.textContent),
        control: Boolean(t.closest('a, button, input, select, textarea, summary [role="button"]')) || ['A', 'BUTTON'].includes(t.tagName),
        focusable: t.hasAttribute('tabindex') || [...t.querySelectorAll('*')].some((e) => e.hasAttribute('tabindex') || ['A', 'BUTTON', 'INPUT'].includes(e.tagName)),
        hiddenVisually: Boolean(box && box.width <= 1 && box.height <= 1 && cs?.display !== 'none' && cs?.visibility !== 'hidden'),
        hiddenFromReaders: Boolean(hidden?.closest('[aria-hidden="true"]')),
      };
    });
    const chapters = [...document.querySelectorAll<HTMLElement>('#outline [data-chapter]')].map((d) => ({
      id: d.dataset.chapter ?? '',
      lessons: d.querySelectorAll('a[data-lesson]').length,
      ticked: d.querySelectorAll('li [data-done="lesson"]').length,
      chapterTick: Boolean(d.querySelector('summary [data-done="chapter"]')),
    }));
    const ticked = [...document.querySelectorAll('li.is-done a[data-lesson]')].map((a) => a.getAttribute('data-lesson') ?? '');
    const plainRows = [...document.querySelectorAll('#outline li:not(.is-done)')].map((li) => li.outerHTML.replace(/ data-lesson="[^"]+"| href="[^"]+"|<bdi>[^<]*<\/bdi>/g, ''));
    return { ticked, chapters, ticks, plainRows };
  });
}

/** The WCAG 2 contrast of an element's border (or, with none, its background) against the page behind it. */
function edgeContrast(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => {
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const behind = (e: Element | null): number[] => {
      for (let x = e?.parentElement ?? null; x; x = x.parentElement) {
        const c = rgb(getComputedStyle(x).backgroundColor);
        if (c.length >= 3 && (c.length === 3 || c[3] === 1)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const cs = getComputedStyle(el);
    const edge = cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0 ? rgb(cs.borderTopColor) : rgb(cs.backgroundColor);
    const a = lum(edge.slice(0, 3));
    const b = lum(behind(el));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

const byIdText = (page: Page, id: string) => page.locator(`#${id}`).innerText().then((s) => s.replace(/\s+/g, ' ').trim());

// ------------------------------------------------------------------- UX-28 ----

describe('UX-28 ticks and done tag', { concurrency: false }, () => {
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

  it('UX-28 accessible names, not focusable, data-done only on done lessons, chapter tick only when all done, the tag on the lesson page; screenshots', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'ar');
    // Folded (Mathematics has five chapters): Fractions all done, nothing else.
    for (const title of MATH_ORDER.slice(0, 2)) assert.equal((await press(salma, s, s.lessons[title], 'done')).status, 303);
    const folded = await browserAs(browser, w, SALMA, { lang: 'ar' });
    await folded.page.goto(w.p.url + subjectPath(s, s.math));
    const f = await outlineFacts(folded.page);
    assert.deepEqual(f.chapters.filter((c) => c.chapterTick).map((c) => c.id), [s.chapters['Fractions']], 'folded: one chapter all done, its tick in the summary');
    assert.equal(await folded.page.locator('#outline details[open]').count(), 0, 'all folded');
    assert.ok(await folded.page.locator('summary [data-done="chapter"]').first().isVisible(), 'the chapter tick shows while folded');
    await uxShot(folded.page, 'UX-28-phone-ar-folded');
    await folded.ctx.close();

    // Three done (AT-1.3's state): Fractions and Decimals all done.
    assert.equal((await press(salma, s, s.lessons[MATH_ORDER[2]], 'done')).status, 303);
    const marked = MATH_ORDER.slice(0, 3).map((t) => s.lessons[t]).sort();
    for (const [width, lang, kit] of [['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company']] as const) {
      const sp = kit === 'company' ? w.company : s;
      const t = words(kit, lang);
      if (kit === 'company') {
        const c = await as(w, SALMA, lang);
        for (const title of MATH_ORDER.slice(0, 3)) assert.equal((await press(c, sp, sp.lessons[title], 'done')).status, 303);
      }
      const { ctx, page } = await browserAs(browser, w, SALMA, { lang, width });
      await page.goto(w.p.url + subjectPath(sp, sp.math) + '?open=all');
      const o = await outlineFacts(page);
      const want = MATH_ORDER.slice(0, 3).map((x) => sp.lessons[x]).sort();
      assert.deepEqual([...o.ticked].sort(), want, `${width} ${lang} ${kit}: ticks on exactly the done lessons`);
      assert.deepEqual(o.ticks.filter((x) => x.kind === 'lesson').length, 3, 'data-done only on done lessons');
      for (const c of o.chapters) assert.equal(c.chapterTick, c.lessons > 0 && c.ticked === c.lessons, `chapter ${c.id}: a tick only when every lesson is done`);
      for (const x of o.ticks) {
        assert.equal(x.hidden, t(x.kind === 'lesson' ? 'doneTag' : 'chapterAllDone'), `${x.kind} tick: its hidden words`);
        assert.equal(x.glyph, '✓', 'a tick sign, not colour alone');
        assert.ok(!x.control && !x.focusable, `${x.kind} tick: not a control, not focusable`);
        assert.ok(x.hiddenVisually && !x.hiddenFromReaders, `${x.kind} tick: the words are visually hidden and read by screen readers`);
      }
      for (const row of o.plainRows) assert.match(row, /^<li><a><\/a><\/li>$/, 'a not-done lesson is exactly as today (no circle, no extra mark)');
      // The accessible name of a done row starts with "Done" (the tick before the title).
      const name = await page.locator('li.is-done').first().evaluate((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim());
      assert.ok(name.startsWith(`✓${t('doneTag')}`) || name.startsWith(`✓ ${t('doneTag')}`), `the row reads "${t('doneTag')}" before the title (${name})`);
      await uxShot(page, `UX-28-${width}-${lang}${kit === 'company' ? '-company' : ''}`);
      await ctx.close();
    }
    assert.deepEqual(marked.length, 3);

    // Keyboard: Tab never lands on a tick (a chapter tick sits inside its summary, which was a focus stop already).
    const k = await browserAs(browser, w, SALMA, { lang: 'ar' });
    await k.page.goto(w.p.url + subjectPath(s, s.math) + '?open=all');
    const stopsToday = await k.page.locator('#outline a, #outline summary').count();
    for (let i = 0; i < 40; i++) {
      await tab(k.page);
      const onTick = await k.page.evaluate(() => Boolean(document.activeElement?.closest('[data-done]')));
      assert.ok(!onTick, `Tab ${i}: focus is never inside a tick`);
    }
    assert.equal(await k.page.locator('#outline [tabindex], [data-done] a, [data-done] button').count(), 0, 'no tick adds a focus stop');
    assert.equal(stopsToday, (await k.page.locator('#outline a[data-lesson]').count()) + (await k.page.locator('#outline summary').count()), 'the outline\'s stops are its lesson links and summaries, as today');

    // The lesson page: the tag "Done" under the place line, text plus tick, 3:1 edge.
    await k.page.goto(w.p.url + lessonPath(s, s.lessons['Comparing fractions']));
    assert.equal((await byIdText(k.page, 'done-tag')), `✓ ${words('school', 'ar')('doneTag')}`, 'the tag: a tick and the word');
    const tagEdge = await edgeContrast(k.page, '#done-tag');
    assert.ok(tagEdge >= 3, `the tag's border against the page: ${tagEdge.toFixed(2)} (3 or more)`);
    assert.equal(await k.page.locator('#done-tag[data-done]').count(), 1, 'the tag carries data-done');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-29 ----

describe('UX-29 progress line on the outline', { concurrency: false }, () => {
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

  it('UX-29 text per state, absent at N = 0, right under the title, same digits as the place line, no bar; screenshots', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const path = subjectPath(s, s.math);
    const today = await (await salma.get(path)).text();
    assert.ok(!/done-progress|data-done/.test(today), 'N = 0: no line, no tick');
    // Mark and undo: the page is exactly today's again.
    assert.equal((await press(salma, s, s.lessons['Adding fractions'], 'done')).status, 303);
    assert.equal((await press(salma, s, s.lessons['Adding fractions'], 'not-done')).status, 303);
    assert.equal(await (await salma.get(path)).text(), today, 'N = 0 after an undo: the page is exactly today\'s');

    await salmaThreeMarks(w, salma);
    for (const lang of LANGS) {
      const t = words('school', lang);
      const { ctx, page } = await browserAs(browser, w, SALMA, { lang });
      await page.goto(w.p.url + path);
      const line = await byIdText(page, 'done-progress');
      assert.equal(line, lang === 'en' ? 'Done: 3 of 5 lessons' : t('doneProgress', { n: '3', total: '5', count: '' }), `${lang}: the line`);
      const under = await page.evaluate(() => document.getElementById('subject-title')?.nextElementSibling?.matches('style') ? document.getElementById('subject-title')!.nextElementSibling!.nextElementSibling?.id : document.getElementById('subject-title')?.nextElementSibling?.id);
      assert.equal(under, 'done-progress', `${lang}: right under the subject title`);
      assert.equal(await page.locator('#done-progress progress, #done-progress [role="progressbar"]').count(), 0, 'text only (no bar drawn)');
      // Digits: the same as the lesson page's place line ("N / M").
      const digits = await page.locator('#done-progress bdi').allInnerTexts();
      assert.deepEqual(digits.filter((d) => /^\d+$/.test(d)), ['3', '5'], `${lang}: the numbers, isolated`);
      await uxShot(page, `UX-29-phone-${lang}-progress`);
      await page.goto(w.p.url + lessonPath(s, s.lessons['Comparing fractions']));
      const place = await byIdText(page, 'lesson-place');
      assert.match(place, /[0-9]+ \/ [0-9]+/, `${lang}: the place line uses the same (Western) digits`);
      assert.doesNotMatch(place + line, /[٠-٩۰-۹]/, `${lang}: no other digits`);
      await ctx.close();
    }

    // All done.
    for (const title of MATH_ORDER.slice(3)) assert.equal((await press(salma, s, s.lessons[title], 'done')).status, 303);
    const en = await (await salma.get(path)).text();
    assert.equal(en.match(/<p id="done-progress"[^>]*>([\s\S]*?)<\/p>/)?.[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), 'All done: 5 lessons', 'en: all done');
    const { ctx, page } = await browserAs(browser, w, SALMA, { lang: 'ar' });
    await page.goto(w.p.url + path);
    assert.equal(await byIdText(page, 'done-progress'), words('school', 'ar')('allDone', { total: '5', count: '' }), 'ar: all done');
    await uxShot(page, 'UX-29-phone-ar-alldone');
    await ctx.close();
  });
});

// ------------------------------------------------------------------- UX-32 ----

describe('UX-32 Arabic, mixed text and kit words for done marks (three kits)', { concurrency: false }, () => {
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

  it('UX-32 the deny list holds for every W2-1 Arabic value', () => {
    for (const key of ALL_W2_KEYS) {
      const found = bare(UI.ar[key]).split(/[^\p{L}]+/u).filter((x) => DENY.includes(x));
      assert.deepEqual(found, [], `${key}: no denied whole word`);
    }
  });

  it('UX-32 lang and dir, bdi, language check by key, and "Done: 3 of 5 lessons / sessions / lectures" in three kits and two languages; screenshot', async () => {
    const salma = await as(w, SALMA, 'ar');
    for (const sp of [w.school, w.company, w.university]) {
      for (const title of MATH_ORDER.slice(0, 3)) assert.equal((await press(salma, sp, sp.lessons[title], 'done')).status, 303);
    }
    for (const lang of LANGS) {
      const other = lang === 'ar' ? 'en' : 'ar';
      // The fixed words of each key in the other language (data, "PDF" and the space's name are outside them).
      const foreign = ALL_W2_KEYS.flatMap((k) => UI[other][k].split(/\{[^}]+\}/).map((x) => x.replace(/[:"،.]/g, '').trim()).filter((x) => x.length > 1));
      for (const sp of [w.school, w.company, w.university]) {
        const t = words(sp.kit, lang);
        const { ctx, page } = await browserAs(browser, w, SALMA, { lang });
        for (const path of [subjectPath(sp, sp.math) + '?open=all', lessonPath(sp, sp.lessons['Comparing fractions']) + '?marked=done']) {
          await page.goto(w.p.url + path);
          assert.deepEqual([await page.getAttribute('html', 'lang'), await page.getAttribute('html', 'dir')], [lang, lang === 'ar' ? 'rtl' : 'ltr'], `${sp.kit} ${lang} ${path}: lang and dir`);
          const text = await wordsOnly(page);
          for (const x of foreign) assert.ok(!text.includes(x), `${sp.kit} ${lang} ${path}: no ${other} words "${x}"`);
        }
        await page.goto(w.p.url + subjectPath(sp, sp.math));
        const line = await byIdText(page, 'done-progress');
        const want = lang === 'en' ? `Done: 3 of 5 ${t('lessonPlural')}` : t('doneProgress', { n: '3', total: '5', count: '' });
        assert.equal(line, want, `${sp.kit} ${lang}: the progress line`);
        if (lang === 'en') assert.equal(line, { school: 'Done: 3 of 5 lessons', company: 'Done: 3 of 5 sessions', university: 'Done: 3 of 5 lectures' }[sp.kit]);
        assert.ok(line.includes(t('lessonPlural')), `${sp.kit} ${lang}: the kit's plural lesson word`);
        // Titles inside the outline's rows stay isolated.
        assert.equal(await page.locator('li.is-done a[data-lesson] > bdi').count(), 3, 'done rows keep the title in <bdi>');
        if (sp.kit === 'university' && lang === 'ar') {
          await page.goto(w.p.url + subjectPath(sp, sp.math) + '?open=all');
          await uxShot(page, 'UX-32-phone-ar-university');
        }
        await ctx.close();
      }
    }
  });
});

// ------------------------------------------------------------------- UX-33 ----

describe('UX-33 no sideways scroll, sizes and contrast for done marks', { concurrency: false }, () => {
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

  for (const lang of LANGS) {
    for (const width of [390, 768, 1280, 320]) {
      it(`UX-33 ${lang} ${width} px: the outline with ticks and the lesson page with its tag and block`, async () => {
        const s = w.school;
        const salma = await as(w, SALMA, lang);
        for (const title of MATH_ORDER.slice(0, 3)) await press(salma, s, s.lessons[title], 'done');
        const { ctx, page } = await browserAs(browser, w, SALMA, { lang });
        await page.setViewportSize({ width, height: 844 });
        for (const path of [subjectPath(s, s.math) + '?open=all', lessonPath(s, s.lessons['Comparing fractions']) + '?marked=done']) {
          await page.goto(w.p.url + path);
          assert.ok(await page.locator('#done-progress, #done-tag').count() >= 1, `${path}: the done-mark elements are on the page`);
          const o = await overflow(page);
          assert.ok(o.sideways <= 0, `${path}: no sideways scroll (${o.sideways} px)`);
          // The ticks' screen-reader words are clipped to 1 px on purpose (visually hidden), so they are left out.
          if (width !== 320) assert.deepEqual(o.clipped.filter((c) => !c.startsWith('span.sr-only:')), [], `${path}: no text overflows its box`);
        }
        await ctx.close();
      });
    }
  }

  it('UX-33 sizes, text and contrast, and the focus ring on the button and on #done-state', async () => {
    const s = w.school;
    const { ctx, page } = await browserAs(browser, w, SALMA, { lang: 'ar' });
    const salma = await as(w, SALMA, 'ar');
    for (const title of MATH_ORDER.slice(0, 3)) await press(salma, s, s.lessons[title], 'done');
    await page.goto(w.p.url + subjectPath(s, s.math) + '?open=all');
    assert.equal((await measure(page, '#done-progress')).length, 1, 'the progress line is there to measure');
    assert.equal((await measure(page, '[data-done] [aria-hidden="true"]')).length, 5, 'three lesson ticks and two chapter ticks to measure');
    for (const m of await measure(page, '#done-progress')) {
      assert.ok(m.fontPx >= 14, `progress line ${m.fontPx}px`);
      assert.ok(m.contrast >= 4.5, `progress line contrast ${m.contrast.toFixed(2)}`);
    }
    for (const m of await measure(page, '[data-done] [aria-hidden="true"]')) assert.ok(m.contrast >= 3, `tick contrast ${m.contrast.toFixed(2)} (a graphic, 3 or more)`);
    for (const m of await measure(page, 'li.is-done a')) assert.ok(m.height >= 44, `a done row's link stays ${m.height}px tall (44 or more)`);

    await page.goto(w.p.url + lessonPath(s, s.lessons['Comparing fractions']) + '?marked=done#done-state');
    for (const sel of ['#done-tag', '#done-status', '.done-now']) {
      for (const m of await measure(page, sel)) {
        assert.ok(m.fontPx >= 14, `${sel} ${m.fontPx}px`);
        assert.ok(m.contrast >= 4.5, `${sel} contrast ${m.contrast.toFixed(2)}`);
      }
    }
    const [b] = await measure(page, '#done-control button');
    assert.ok(b.width >= 44 && b.height >= 44, `the button ${b.width}x${b.height} (44 x 44 or more)`);
    // The focused block (after a press, the page opens at it).
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { id: el.id, px: cs.outlineStyle !== 'none' ? parseFloat(cs.outlineWidth) : 0, color: cs.outlineColor };
    });
    assert.equal(ring.id, 'done-state', 'the block has focus');
    assert.ok(ring.px >= 2, `#done-state focus ring ${ring.px}px`);
    // The button's ring (the wave 1 ring), reached by Tab.
    let at = await tab(page);
    for (let i = 0; i < 10 && !at.text.length; i++) at = await tab(page);
    assert.ok(at.ringPx >= 2 && at.ringContrast >= 3, `the button's focus ring ${at.ringPx}px, ${at.ringContrast.toFixed(2)}:1 (${at.tag} ${at.text})`);
    await ctx.close();
  });
});
