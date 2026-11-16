// Shared by the L2 sign-in tests (product-contract v2 on PIL-210, sections 8.3
// and 8.4, AT-5): the pages of section 8.3, a fresh browser whose language is
// English, and the words of the pages outside any space.
import assert from 'node:assert/strict';
import type { Browser, BrowserContext, Page } from 'playwright';
import { Client } from '../support/http.ts';
import { OWNER } from '../support/seed.ts';
import { makeLabel, type Lang } from '../../src/labels.ts';
import { WIDTHS, type Width } from '../wave1/world.ts';

/** The words of the pages outside any space (no kit). */
export const product = (lang: Lang) => makeLabel(lang);

/** A fresh browser whose language is English (Accept-Language: en-US), with nothing chosen on it. */
export async function englishBrowser(browser: Browser, opts: { width?: Width; script?: boolean; storageState?: Awaited<ReturnType<BrowserContext['storageState']>> } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ locale: 'en-US', viewport: WIDTHS[opts.width ?? 'phone'], javaScriptEnabled: opts.script ?? true, storageState: opts.storageState });
  ctx.setDefaultTimeout(15_000);
  return { ctx, page: await ctx.newPage() };
}

/** The page's language and direction. */
export async function langOf(page: Page): Promise<{ lang: string | null; dir: string | null }> {
  return { lang: await page.getAttribute('html', 'lang'), dir: await page.getAttribute('html', 'dir') };
}

export const AR = { lang: 'ar', dir: 'rtl' };
export const EN = { lang: 'en', dir: 'ltr' };

/** A request client on a fresh device whose browser asks for English. */
export class EnglishDevice extends Client {
  constructor(base: string, lang: 'ar' | 'en' | null = null) {
    super(base, { lang });
  }
  override get(path: string): Promise<Response> {
    return this.getWith(path, { 'accept-language': 'en-US,en;q=0.9' });
  }
  override post(path: string, fields: Record<string, string> | FormData): Promise<Response> {
    return this.postWith(path, fields, { origin: this.base, 'accept-language': 'en-US,en;q=0.9' });
  }
}

/** The <html> element's lang and dir in a page's markup. */
export function htmlLang(body: string): { lang: string; dir: string } {
  const tag = body.match(/<html\b[^>]*>/)?.[0] ?? '';
  return { lang: tag.match(/\blang="([^"]*)"/)?.[1] ?? '', dir: tag.match(/\bdir="([^"]*)"/)?.[1] ?? '' };
}

/** Signs the owner in on a request client. */
export async function ownerSignedIn(c: Client): Promise<void> {
  assert.equal((await c.post('/signin', { username: OWNER.username, password: OWNER.password })).status, 302, 'the owner signs in');
}

/** Signs a person in through the real form in a browser. */
export async function signInThrough(page: Page, base: string, who: { username: string; password: string }): Promise<void> {
  await page.goto(base + '/signin');
  await page.fill('form#signin input[name=username]', who.username);
  await page.fill('form#signin input[name=password]', who.password);
  await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
}

/** A failed sign-in's markup with the typed username taken out (AT-5.3). */
export const withoutUsername = (body: string, username: string) => body.split(`value="${username}"`).join('value="…"');
