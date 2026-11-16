// UX-15b (ux-plan v2 on PIL-210, L2): every new control is at least 44 × 44
// CSS px; new text is at least 14 px with contrast at least 4.5:1 against its
// background (WCAG 2 ratio from getComputedStyle, the nearest opaque
// background), on the guardian home, the lesson editor and the sign-in pages,
// in Arabic and English, at 390 and 1280 px.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { measure } from '../wave1/ux.ts';
import { PAGES, open, sizes, sweepWorld, tabFor, type Sweep, type Who } from './pages.ts';

/** The new controls and the new text of L2, by page. */
const CONTROLS = ['.latest-result', '#add-new a.choice', 'form:not([hidden]) a.cancel', '#lang-switch', '#owner-recovery a', '#back-to-signin'];
const TEXT = [
  '.latest-result .what', '.latest-result .exam', '.latest-result .subject', '.latest-result .date', '.latest-result .score', '.latest-result .tag',
  '.last-opened', '#add-new > h2', '#add-new a.choice', '#added', 'form:not([hidden]) a.cancel', 'form:not([hidden]) .field-error',
  '#forgot', '#owner-recovery a', '#recover-who', '#lang-switch', '#back-to-signin',
];

describe('UX-15b sizes and contrast on guardian, editor and sign-in pages', { concurrency: false }, () => {
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

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: new controls at least 44 × 44, new text at least 14 px and 4.5:1`, async () => {
      const found = new Set<string>();
      for (const who of ['mona', 'hadeer', 'nobody'] as Who[]) {
        const tab = await tabFor(browser, s, who, lang);
        for (const p of PAGES.filter((x) => x.who === who)) {
          for (const width of ['phone', 'desktop'] as const) {
            await tab.page.setViewportSize(sizes(width));
            await open(tab.page, s, p);
            for (const sel of CONTROLS) {
              for (const m of await measure(tab.page, sel)) {
                if (m.width === 0 && m.height === 0) continue; // not shown here
                found.add(sel);
                assert.ok(m.width >= 44 && m.height >= 44, `${lang} ${p.name} ${width} ${sel} "${m.text}": ${m.width} × ${m.height}`);
              }
            }
            for (const sel of TEXT) {
              for (const m of await measure(tab.page, sel)) {
                if (m.width === 0 && m.height === 0) continue;
                found.add(sel);
                assert.ok(m.fontPx >= 14, `${lang} ${p.name} ${width} ${sel} "${m.text}": ${m.fontPx}px`);
                assert.ok(m.contrast >= 4.5, `${lang} ${p.name} ${width} ${sel} "${m.text}": contrast ${m.contrast.toFixed(2)}`);
              }
            }
          }
        }
        await tab.close();
      }
      assert.deepEqual([...CONTROLS, ...TEXT].filter((sel) => !found.has(sel)), [], 'every new control and text was measured somewhere');
    });
  }
});
