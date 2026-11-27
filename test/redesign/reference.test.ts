// LMS redesign wave R1a (product-contract v2 on PIL-322, S12, non-gating
// evidence): renders the owner-approved prototype, docs/visual/prototype-v1.html
// (byte-identical to prototype-v1 on PIL-321 except that its Google Fonts links
// point to our own font files), into evidence/ux/ref/P<n>-<width>.png, the
// reference the product screenshots are compared with by eye.
import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright';
// @ts-expect-error: a plain ES module (tools/build-assets.mjs) with no type file.
import { buildAssets } from '../../tools/build-assets.mjs';

const file = join(import.meta.dirname, '..', '..', 'docs', 'visual', 'prototype-v1.html');
const OUT = 'evidence/ux/ref/';
const SHOTS: [string, string, number, number][] = [
  ['P2', 'home', 375, 812], ['P2', 'home', 768, 1024], ['P2', 'home', 1280, 900],
  ['P8', 'todo', 375, 812], ['P14', 'home', 1280, 900],
];
const name = (w: number) => (w < 700 ? 'phone' : w < 960 ? 'tablet' : 'desktop');

let browser: Browser;
before(async () => {
  buildAssets();
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

it('reference: the prototype copy asks no other host and renders its screens (evidence/ux/ref)', async () => {
  assert.doesNotMatch(readFileSync(file, 'utf8'), /https?:\/\//, 'no other host');
  for (const [p, route, width, height] of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'ar-EG' });
    const page = await ctx.newPage();
    await page.goto(`${pathToFileURL(file).href}#${route}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}${p}-${name(width)}.png`, fullPage: true });
    await ctx.close();
  }
});
