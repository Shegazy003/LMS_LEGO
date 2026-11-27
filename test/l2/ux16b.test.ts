// UX-16b (ux-plan v2 on PIL-210, L2): lang and dir are correct on every page
// L2 changes; titles, names and usernames from data are in <bdi> or
// dir="auto"; marks such as "14 / 20" and dates show as the product shows them
// today (Western digits, YYYY-MM-DD). Language check by key: on a page rendered
// in Arabic none of the English ui.ts values of the keys L2 adds or changes
// appears as visible text, and on an English page none of their Arabic values,
// except data (titles, names, usernames) and the allowlist: "PDF", the space's
// name and logo text, and the language switch's other-language label.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { UI } from '../../src/i18n/ui.ts';
import { L2_KEYS, MIXED_TITLE, PAGES, open, sweepWorld, tabFor, wordsOnly, type Sweep, type Who } from './pages.ts';
import { firstResultRow, go, learnerPage, SALMA } from './world.ts';

/** The fixed words of a dictionary value (the parts between its {placeholders}), without the allowlist. */
function fragments(lang: 'ar' | 'en'): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const key of L2_KEYS) {
    for (const part of UI[lang][key].split(/\{\w+\}/)) {
      const text = part.replace(/\bPDF\b/g, ' ').replace(/[·:()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length >= 2) out.push({ key, text });
    }
  }
  return out;
}

describe('UX-16b Arabic and mixed text on guardian, editor and sign-in pages', { concurrency: false }, () => {
  let s: Sweep;
  let browser: Browser;
  before(async () => {
    s = await sweepWorld();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await s?.close();
  });

  it('the language check finds the words it looks for (self-check)', () => {
    assert.ok(fragments('en').some((f) => f.text === 'Latest result'));
    assert.ok(fragments('ar').some((f) => f.key === 'forgotPassword'));
    assert.ok(!fragments('en').some((f) => f.text.includes('PDF')), 'PDF is allowed');
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: lang and dir, data isolated, marks and dates as today, and no word of the other language's dictionary`, async () => {
      const other = fragments(lang === 'ar' ? 'en' : 'ar');
      for (const who of ['mona', 'hadeer', 'nobody'] as Who[]) {
        const tab = await tabFor(browser, s, who, lang);
        for (const p of PAGES.filter((x) => x.who === who)) {
          await open(tab.page, s, p);
          assert.equal(await tab.page.getAttribute('html', 'lang'), lang, `${p.name}: lang`);
          assert.equal(await tab.page.getAttribute('html', 'dir'), lang === 'ar' ? 'rtl' : 'ltr', `${p.name}: dir`);
          const text = await wordsOnly(tab.page);
          const hits = other.filter((f) => text.includes(f.text)).map((f) => `${f.key}: "${f.text}"`);
          assert.deepEqual(hits, [], `${lang} ${p.name}: no word of the other language`);
          const bare = await tab.page.evaluate(() => {
            // Data on the changed pieces must sit in <bdi> or dir="auto".
            const pieces = [...document.querySelectorAll('.latest-result .exam, .latest-result .subject, #items .title, #lesson-title, input[name=username]')];
            const bare = pieces.filter((e) => !(e.closest('bdi') || e.closest('[dir=auto]') || e.getAttribute('dir') === 'auto' || e.tagName === 'BDI')).map((e) => `${e.tagName.toLowerCase()}.${e.className}`);
            // Names, the lesson title of "Last opened" and the title of "Added": all their data inside one <bdi>.
            for (const e of document.querySelectorAll('#linked h2, .last-opened, #added')) {
              if (e.matches('.last-opened') && !/\d/.test(e.textContent ?? '')) continue; // "No open recorded": no data
              const data = [...e.querySelectorAll('bdi')].map((b) => b.textContent ?? '').join('');
              if (!data.trim()) bare.push(`${e.tagName.toLowerCase()}.${e.className}: no <bdi>`);
            }
            return bare;
          });
          assert.deepEqual(bare, [], `${lang} ${p.name}: data in <bdi> or dir="auto"`);
          if (p.name === 'guardian home') {
            const line = await tab.page.evaluate(() => {
              const l = document.querySelector('.latest-result');
              return { score: (l?.querySelector('.score') as HTMLElement | null)?.innerText.trim() ?? '', date: (l?.querySelector('.date') as HTMLElement | null)?.innerText.trim() ?? '', day: l?.querySelector('.date time')?.getAttribute('datetime') ?? '', exam: (l?.querySelector('.exam') as HTMLElement | null)?.innerText.trim() ?? '' };
            });
            assert.match(line.score, /^\d{1,4}(\.\d)? \/ \d{1,4}$/, 'the mark in Western digits, as today');
            // R1a (UX-16a row, contract S4): the date shown as day + month name (the year only when not this UTC
            // year); the stored day in <time datetime>.
            assert.match(line.date, lang === 'ar' ? /^\d{1,2} [؀-ۿ]+( \d{4})?$/ : /^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/, 'the date as S4 shows it');
            assert.match(line.day, /^\d{4}-\d{2}-\d{2}$/, 'the stored day');
            assert.equal(line.exam, MIXED_TITLE, 'the Arabic exam title with Latin words, whole');
            await go(tab.page, s.w, learnerPage(s.w.school, s.w.ids[SALMA.username]));
            const row = await firstResultRow(tab.page);
            assert.deepEqual([line.score, line.day], [row?.score, row?.date], 'exactly as the learner page shows them');
          }
        }
        await tab.close();
      }
    });
  }
});
