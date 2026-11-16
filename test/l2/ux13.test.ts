// UX-13 (ux-plan v2 on PIL-210, L2): the recovery route reads right. Under the
// form, the "ask the person who gave you your account" line in body text;
// under it, separated, the smaller "Product owner: use your recovery code"
// link (at least 14 px, at least 44 px target). The recovery page's new line is
// the first text after its heading, with a link back to sign-in. Screenshots:
// UX-13-phone-ar.png (sign-in, lower half), UX-13-phone-ar-recover.png.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { UX_EVIDENCE, uxShot, wave1World, type Wave1World } from '../wave1/world.ts';
import { englishBrowser, product } from './signin.ts';

describe('UX-13 recovery wording and owner link', { concurrency: false }, () => {
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

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: the main line in body text under the form, then, separated, the smaller owner link of at least 14 px and a 44 px target`, async () => {
      const t = product(lang);
      const { ctx, page } = await englishBrowser(browser);
      await page.goto(w.p.url + `/signin?lang=${lang}`);
      const seen = await page.evaluate(() => {
        const px = (e: Element) => parseFloat(getComputedStyle(e).fontSize);
        const form = document.querySelector('form#signin')!.getBoundingClientRect();
        const forgot = document.querySelector('#forgot')!;
        const owner = document.querySelector('#owner-recovery')!;
        const link = owner.querySelector('a')!;
        const lr = link.getBoundingClientRect();
        return {
          bodyPx: px(document.body), forgotPx: px(forgot), ownerPx: px(link),
          forgotTop: forgot.getBoundingClientRect().top, formBottom: form.bottom,
          gap: owner.getBoundingClientRect().top - forgot.getBoundingClientRect().bottom, linkHeight: lr.height, linkWidth: lr.width,
          forgotText: (forgot as HTMLElement).innerText.trim(), linkText: link.innerText.trim(),
        };
      });
      assert.equal(seen.forgotText, t('forgotPassword'));
      assert.equal(seen.linkText, t('ownerRecovery'));
      assert.ok(seen.forgotTop >= seen.formBottom, 'under the form');
      assert.equal(seen.forgotPx, seen.bodyPx, `the main line in body text (${seen.forgotPx}px)`);
      assert.ok(seen.ownerPx >= 14 && seen.ownerPx < seen.forgotPx, `the owner link is smaller, at least 14 px (${seen.ownerPx}px)`);
      assert.ok(seen.gap >= 8, `separated (${seen.gap}px)`);
      assert.ok(seen.linkHeight >= 44 && seen.linkWidth >= 44, `a 44 px target (${seen.linkWidth} × ${seen.linkHeight})`);
      if (lang === 'ar') {
        const box = await page.locator('form#signin').boundingBox();
        const full = await page.evaluate(() => document.documentElement.scrollHeight);
        const top = Math.max(0, Math.floor((box?.y ?? 0) + (box?.height ?? 0) / 2));
        mkdirSync(UX_EVIDENCE, { recursive: true });
        await page.screenshot({ path: `${UX_EVIDENCE}UX-13-phone-ar.png`, fullPage: true, clip: { x: 0, y: top, width: 390, height: Math.max(200, full - top) } });
      }
      await ctx.close();
    });

    it(`${lang}: /recover's new line is the first text after its heading, with a link back to sign-in`, async () => {
      const t = product(lang);
      const { ctx, page } = await englishBrowser(browser);
      await page.goto(w.p.url + `/recover?lang=${lang}`);
      const seen = await page.evaluate(() => {
        const h1 = document.querySelector('main h1')!;
        let next = h1.nextElementSibling as HTMLElement | null;
        while (next && !next.innerText.trim()) next = next.nextElementSibling as HTMLElement | null;
        const back = document.querySelector('#back-to-signin');
        return { first: next?.innerText.replace(/\s+/g, ' ').trim() ?? '', firstId: next?.id ?? '', back: back?.getAttribute('href') ?? null, backText: (back as HTMLElement | null)?.innerText.trim() ?? '' };
      });
      assert.equal(seen.firstId, 'recover-who');
      assert.ok(seen.first.startsWith(t('recoverOnlyOwner')), seen.first);
      assert.equal(seen.back, '/signin');
      assert.equal(seen.backText, t('backToSignIn'));
      if (lang === 'ar') await uxShot(page, 'UX-13-phone-ar-recover');
      await ctx.close();
    });
  }
});
