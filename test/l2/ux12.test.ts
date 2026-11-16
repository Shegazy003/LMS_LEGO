// UX-12 (ux-plan v2 on PIL-210, L2): sign-in in Arabic first. Arabic, RTL,
// with lang="ar" dir="rtl" on the page; the switch at the top corner (top left
// in Arabic, top right in English), labelled in the other language with lang
// set on the link ("English" has lang="en"). Fields keep their labels visible
// (no placeholder-only labels); the username field is dir="auto" so Latin
// usernames type left to right inside the Arabic page. Screenshots:
// UX-12-phone-ar.png, UX-12-tablet-ar.png, UX-12-desktop-ar.png, UX-12-phone-en.png.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { uxShot, wave1World, type Wave1World, type Width } from '../wave1/world.ts';
import { AR, EN, englishBrowser, langOf, product } from './signin.ts';

describe('UX-12 Arabic-first sign-in and switch', { concurrency: false }, () => {
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

  for (const [width, lang] of [['phone', 'ar'], ['tablet', 'ar'], ['desktop', 'ar'], ['phone', 'en']] as [Width, 'ar' | 'en'][]) {
    it(`${width} ${lang}: lang and dir, the switch in the top ${lang === 'ar' ? 'left' : 'right'} corner in the other language, visible labels, username dir=auto`, async () => {
      const { ctx, page } = await englishBrowser(browser, { width });
      await page.goto(w.p.url + '/signin');
      if (lang === 'en') await Promise.all([page.waitForEvent('load'), page.locator('#lang-switch').click()]);
      assert.deepEqual(await langOf(page), lang === 'ar' ? AR : EN);
      const sw = await page.locator('#lang-switch').evaluate((a) => {
        const r = a.getBoundingClientRect();
        return { text: (a as HTMLElement).innerText.trim(), lang: a.getAttribute('lang'), left: r.left, right: r.right, top: r.top, width: window.innerWidth, height: r.height };
      });
      assert.equal(sw.text, product(lang)('switchLanguage'));
      assert.equal(sw.text, lang === 'ar' ? 'English' : 'العربية');
      assert.equal(sw.lang, lang === 'ar' ? 'en' : 'ar', 'lang set on the link, in the other language');
      assert.ok(sw.top < 64, `at the top (${sw.top})`);
      if (lang === 'ar') assert.ok(sw.left < 40, `top left in Arabic (left ${sw.left})`);
      else assert.ok(sw.right > sw.width - 40, `top right in English (right ${sw.right} of ${sw.width})`);
      assert.ok(sw.height >= 44, `a 44 px target (${sw.height})`);
      const fields = await page.locator('form#signin input:not([type=hidden])').evaluateAll((inputs) => inputs.map((i) => {
        const label = i.closest('label');
        const text = label ? [...label.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim() : '';
        return { name: i.getAttribute('name'), label: text, visible: label ? (label as HTMLElement).offsetParent !== null : false, placeholder: i.getAttribute('placeholder'), dir: i.getAttribute('dir') };
      }));
      const t = product(lang);
      assert.deepEqual(fields.map((f) => [f.name, f.label, f.visible]), [['username', t('username'), true], ['password', t('password'), true]], 'every field keeps a visible label');
      assert.ok(fields.every((f) => !f.placeholder), 'no placeholder-only label');
      assert.equal(fields[0].dir, 'auto', 'the username field is dir=auto');
      await page.fill('form#signin input[name=username]', 'salma.a');
      const typed = await page.locator('form#signin input[name=username]').evaluate((i) => getComputedStyle(i).direction);
      assert.equal(typed, 'ltr', 'a Latin username types left to right');
      await page.fill('form#signin input[name=username]', '');
      await uxShot(page, `UX-12-${width}-${lang}`);
      await ctx.close();
    });
  }
});
