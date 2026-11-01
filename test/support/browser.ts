// Browser helpers for the AT-5 journey (a phone-width Chromium context per
// person, signing in through the real form, submitting a form with its own
// button, screenshots). Earlier tests keep their own copies of these helpers.
import assert from 'node:assert/strict';
import type { Browser, BrowserContext, Page } from 'playwright';

export interface Phone {
  ctx: BrowserContext;
  page: Page;
}

export const PHONE = { width: 412, height: 915 };

/** A fresh phone (its own cookies), Arabic first unless told otherwise. */
export async function phone(browser: Browser, locale = 'ar-EG'): Promise<Phone> {
  const ctx = await browser.newContext({ locale, viewport: PHONE });
  ctx.setDefaultTimeout(15_000);
  return { ctx, page: await ctx.newPage() };
}

export async function signIn(base: string, page: Page, username: string, password: string): Promise<void> {
  await page.goto(base + '/signin');
  await page.fill('form#signin input[name=username]', username);
  await page.fill('form#signin input[name=password]', password);
  await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
}

/** Submits a form with its own button; returns the status of the form's own response (before any redirect). */
export async function submit(page: Page, form: string, button = 'button[type=submit]'): Promise<number> {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.request().frame() === page.mainFrame()),
    page.waitForEvent('load'),
    page.locator(form).locator(button).first().click(),
  ]);
  return res.status();
}

/** Follows a link the way a person does. */
export async function follow(page: Page, selector: string): Promise<void> {
  await Promise.all([page.waitForEvent('load'), page.locator(selector).first().click()]);
}

export async function shot(page: Page, dir: string, name: string): Promise<void> {
  await page.screenshot({ path: `${dir}${name}.png`, fullPage: true });
}

/** Everything a person can read on the page. */
export async function readable(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

/** The page's language and direction, and that it fits the phone's width. */
export async function assertPage(page: Page, where: string, lang: 'ar' | 'en'): Promise<void> {
  assert.equal(await page.getAttribute('html', 'lang'), lang, `${where}: language ${lang}`);
  assert.equal(await page.getAttribute('html', 'dir'), lang === 'ar' ? 'rtl' : 'ltr', `${where}: direction`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${where}: fits the phone width (overflow ${overflow}px)`);
}

/** Whether a word stands on its own in the text (not as part of a longer word). */
export function hasWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{M}])${escaped}(?![\\p{L}\\p{M}])`, 'u').test(text);
}
