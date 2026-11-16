// AT-5.1 (product-contract v2, LMS wave 1, L2, section 8.3): every page of
// section 8.3 first shows in Arabic, right to left, whatever the browser
// language. On /signin, /recover and /setup the language switch shows
// "English" (in Arabic) or "العربية" (in English); choosing English shows the
// page in English, left to right, and the choice stays after reload and
// reopening on that browser only (a fresh browser starts in Arabic), and
// applies to every page of section 8.3.
//
// Section 8.3's pages: signed out, /setup, /signin and /recover (with their
// answers to a failed post), the not-found page and a refusal message page;
// signed in with no language of one's own, the space list /home, the owner's
// pages under /owner and the owner's /account.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { startProduct, type Product } from '../support/product.ts';
import { OWNER } from '../support/seed.ts';
import { SALMA, wave1World, type Wave1World } from '../wave1/world.ts';
import { AR, EN, EnglishDevice, englishBrowser, htmlLang, langOf, ownerSignedIn, product, signInThrough } from './signin.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const ONE_YEAR = 365 * 24 * 60 * 60;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Every page of section 8.3 a request client reaches, with the language and direction it is in. */
async function pagesOf(w: Wave1World, fresh: Product, lang: 'ar' | 'en' | null): Promise<[string, { lang: string; dir: string }][]> {
  const out: [string, { lang: string; dir: string }][] = [];
  const read = async (name: string, res: Response) => out.push([`${name} (${res.status})`, htmlLang(await res.text())]);
  const signedOut = new EnglishDevice(w.p.url, lang);
  await read('/signin', await signedOut.get('/signin'));
  await read('/recover', await signedOut.get('/recover'));
  await read('/signin failed', await signedOut.post('/signin', { username: 'nobody.here', password: 'not-a-password' }));
  await read('/recover failed', await signedOut.post('/recover', { username: 'nobody.here', code: 'AAAA-BBBB-CCCC-DDDD', password: 'new-password-1' }));
  await read('not found', await signedOut.get('/no-such-page'));
  await read('refusal (setup closed)', await signedOut.post('/setup', { username: 'second', password: 'second-owner-pass', mobile: '+201000000002' }));
  const setup = new EnglishDevice(fresh.url, lang);
  await read('/setup', await setup.get('/setup'));
  await read('/setup failed', await setup.post('/setup', { username: 'x', password: 'short', mobile: '0100' }));
  const salma = new EnglishDevice(w.p.url, lang);
  assert.equal((await salma.post('/signin', { username: SALMA.username, password: SALMA.password })).status, 302);
  await read('/home (Salma, three spaces, no language of her own)', await salma.get('/home'));
  const owner = new EnglishDevice(w.p.url, lang);
  await ownerSignedIn(owner);
  for (const path of ['/owner', '/owner/spaces/new', `/owner/spaces/${w.school.id}`, '/account', '/account/language']) await read(path, await owner.get(path));
  return out;
}

describe('AT-5.1 Arabic first on every page outside a space, whatever the browser language; the switch remembers English on this browser only', { concurrency: false }, () => {
  let w: Wave1World;
  let fresh: Product;
  let browser: Browser;
  before(async () => {
    w = await wave1World();
    fresh = await startProduct();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await fresh?.stop();
    await w?.close();
  });

  it('a device that chose nothing and asks for English gets every page of section 8.3 in Arabic, right to left', async () => {
    const pages = await pagesOf(w, fresh, null);
    assert.ok(pages.length >= 13, `pages read: ${pages.length}`);
    for (const [name, seen] of pages) assert.deepEqual(seen, AR, name);
  });

  it('the browser\'s language is no longer read anywhere in the product', () => {
    for (const f of sourceFiles(join(root, 'src'))) assert.ok(!/accept-language/i.test(readFileSync(f, 'utf8')), `${f}: Accept-Language is not read`);
  });

  it('with the switch set to English, every page of section 8.3 is in English, left to right; ?lang= takes only ar and en', async () => {
    for (const [name, seen] of await pagesOf(w, fresh, 'en')) assert.deepEqual(seen, EN, name);
    const c = new EnglishDevice(w.p.url, null);
    const set = await c.get('/signin?lang=en');
    const line = set.headers.getSetCookie().find((l) => l.startsWith('lms_lang='));
    assert.ok(line, 'the switch sets the cookie');
    assert.match(line, /^lms_lang=en;/);
    assert.match(line, /Path=\//);
    assert.match(line, /HttpOnly/i);
    assert.match(line, /SameSite=Lax/i);
    assert.equal(Number(line.match(/Max-Age=(\d+)/i)?.[1]), ONE_YEAR, 'kept a year');
    assert.deepEqual(htmlLang(await set.text()), EN, 'the page answers in English at once');
    for (const bad of ['fr', 'EN', 'en-US', '', 'ar;en']) {
      const d = new EnglishDevice(w.p.url, null);
      const res = await d.get(`/signin?lang=${encodeURIComponent(bad)}`);
      assert.ok(!res.headers.getSetCookie().some((l) => l.startsWith('lms_lang=')), `?lang=${bad} is ignored`);
      assert.deepEqual(htmlLang(await res.text()), AR, `?lang=${bad}: still Arabic`);
    }
    const odd = await fetch(w.p.url + '/signin', { headers: { cookie: 'lms_lang=fr', 'accept-language': 'en-US' } });
    assert.deepEqual(htmlLang(await odd.text()), AR, 'a cookie value other than ar or en means Arabic');
  });

  it('in a browser set to English: Arabic first; English by the switch, after a reload and after reopening; a fresh browser starts in Arabic; back to Arabic', async () => {
    const first = await englishBrowser(browser);
    const page: Page = first.page;
    await page.goto(w.p.url + '/signin');
    assert.deepEqual(await langOf(page), AR, 'Arabic first');
    const sw = page.locator('#lang-switch');
    assert.equal((await sw.innerText()).trim(), product('ar')('switchLanguage'));
    assert.equal((await sw.innerText()).trim(), 'English');
    assert.equal(await sw.getAttribute('lang'), 'en');
    assert.equal(await sw.getAttribute('href'), '/signin?lang=en');
    await Promise.all([page.waitForEvent('load'), sw.click()]);
    assert.deepEqual(await langOf(page), EN, 'English after the switch');
    assert.equal((await page.locator('#lang-switch').innerText()).trim(), 'العربية');
    assert.equal(await page.locator('#lang-switch').getAttribute('lang'), 'ar');
    await page.goto(w.p.url + '/signin');
    await page.reload();
    assert.deepEqual(await langOf(page), EN, 'after a reload');
    for (const path of ['/recover', '/no-such-page']) {
      await page.goto(w.p.url + path);
      assert.deepEqual(await langOf(page), EN, `${path}: the choice applies`);
    }
    await page.goto(fresh.url + '/setup');
    assert.deepEqual(await langOf(page), EN, '/setup: the choice applies');
    const state = await first.ctx.storageState();
    const kept = state.cookies.find((c) => c.name === 'lms_lang');
    assert.ok(kept && kept.expires > Date.now() / 1000 + 300 * 24 * 3600, 'a lasting cookie, kept when the browser closes');
    await first.ctx.close();

    const reopened = await englishBrowser(browser, { storageState: state });
    await reopened.page.goto(w.p.url + '/signin');
    assert.deepEqual(await langOf(reopened.page), EN, 'after closing and reopening the browser');
    await signInThrough(reopened.page, w.p.url, OWNER);
    await reopened.page.goto(w.p.url + '/owner');
    assert.deepEqual(await langOf(reopened.page), EN, '/owner: the owner has no language of their own, so the choice applies');
    await reopened.page.goto(w.p.url + '/account');
    assert.deepEqual(await langOf(reopened.page), EN, 'the owner\'s /account');
    await Promise.all([reopened.page.waitForEvent('load'), reopened.page.locator('form#signout button').click()]);
    await reopened.page.goto(w.p.url + '/recover');
    await Promise.all([reopened.page.waitForEvent('load'), reopened.page.locator('#lang-switch').click()]);
    assert.deepEqual(await langOf(reopened.page), AR, 'switched back to Arabic');
    assert.equal(new URL(reopened.page.url()).pathname, '/recover', 'on the same page');
    await reopened.page.goto(w.p.url + '/signin');
    assert.deepEqual(await langOf(reopened.page), AR, 'Arabic stays');
    await reopened.ctx.close();

    const other = await englishBrowser(browser);
    await other.page.goto(w.p.url + '/signin');
    assert.deepEqual(await langOf(other.page), AR, 'a fresh browser starts in Arabic');
    await other.page.goto(fresh.url + '/setup');
    assert.deepEqual(await langOf(other.page), AR);
    assert.equal(await other.page.locator('#lang-switch').getAttribute('href'), '/setup?lang=en', 'the switch on /setup');
    await other.ctx.close();
  });
});
