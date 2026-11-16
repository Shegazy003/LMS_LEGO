// AT-5.3 (product-contract v2, LMS wave 1, L2, section 8.4): under the sign-in
// form everyone sees "Forgot your password? Ask the person who gave you your
// account to send you a reset link."; separately, in smaller text, "Product
// owner: use your recovery code" links to /recover. The page's text and
// structure do not depend on any username. The two failed sign-in answers
// (unknown username, Salma's username with a wrong password) have the same
// status, the same single message and the same markup, apart from the typed
// username and any per-request token.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { Client } from '../support/http.ts';
import { SALMA, plain, wave1World, type Wave1World } from '../wave1/world.ts';
import { englishBrowser, product, withoutUsername } from './signin.ts';

describe('AT-5.3 the sign-in page sends each person the right way, and its two failures are one answer', { concurrency: false }, () => {
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

  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: the ask-your-account-giver line under the form, then the smaller owner link to /recover`, async () => {
      const t = product(lang);
      const { ctx, page } = await englishBrowser(browser);
      await page.goto(w.p.url + `/signin?lang=${lang}`);
      const seen = await page.evaluate(() => {
        const form = document.querySelector('form#signin')!;
        const forgot = document.querySelector('#forgot') as HTMLElement;
        const owner = document.querySelector('#owner-recovery') as HTMLElement;
        const link = owner?.querySelector('a');
        const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        return {
          forgot: forgot?.innerText.trim(), owner: owner?.innerText.trim(), href: link?.getAttribute('href'),
          order: after(form, forgot) && after(forgot, owner), separate: forgot !== owner && !forgot.contains(owner) && !owner.contains(forgot),
          forgotPx: parseFloat(getComputedStyle(forgot).fontSize), ownerPx: parseFloat(getComputedStyle(owner).fontSize),
          forgotLinks: forgot.querySelectorAll('a').length,
        };
      });
      assert.equal(seen.forgot, t('forgotPassword'));
      assert.equal(seen.owner, t('ownerRecovery'));
      if (lang === 'en') {
        assert.equal(seen.forgot, 'Forgot your password? Ask the person who gave you your account to send you a reset link.');
        assert.equal(seen.owner, 'Product owner: use your recovery code');
      }
      assert.equal(seen.href, '/recover', 'the owner line links to /recover');
      assert.equal(seen.forgotLinks, 0, 'the main line is a sentence, not the recovery link');
      assert.ok(seen.order && seen.separate, 'under the form, the main line first, the owner line separately after it');
      assert.ok(seen.ownerPx < seen.forgotPx, `the owner line is smaller (${seen.ownerPx} < ${seen.forgotPx})`);
      await ctx.close();
    });
  }

  it('the page does not depend on any username: /signin is the same bytes for everyone, whatever was typed before', async () => {
    const a = await (await new Client(w.p.url).get('/signin')).text();
    const b = new Client(w.p.url);
    await b.post('/signin', { username: SALMA.username, password: 'wrong-password-1' });
    assert.equal(await (await b.get('/signin')).text(), a);
    assert.ok(!a.includes(SALMA.username));
  });

  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: an unknown username and Salma's username with a wrong password get the same status, the one message and the same markup`, async () => {
      const t = product(lang);
      const unknown = await new Client(w.p.url, { lang }).post('/signin', { username: 'nobody.here', password: 'wrong-password-1' });
      const wrong = await new Client(w.p.url, { lang }).post('/signin', { username: SALMA.username, password: 'wrong-password-1' });
      assert.equal(unknown.status, 401);
      assert.equal(wrong.status, unknown.status, 'the same status');
      const [u, s] = [await unknown.text(), await wrong.text()];
      for (const body of [u, s]) {
        assert.equal([...body.matchAll(/role="alert"/g)].length, 1, 'one message');
        assert.ok(plain(body).includes(t('signInFailed')), 'today\'s single message');
      }
      assert.equal(withoutUsername(s, SALMA.username), withoutUsername(u, 'nobody.here'), 'the same markup, apart from the typed username');
    });
  }
});
