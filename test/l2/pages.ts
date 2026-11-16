// The pages task L2 changes (LMS wave 1), for the sweeps of UX-14b to UX-17b:
// the guardian home (activity on and off, long titles), the lesson editor
// (closed, a form open, a refusal, after an addition), and the pages outside a
// space with the switch (/signin and its failed answer, /recover, /setup).
import type { Browser, Page } from 'playwright';
import { startProduct, type Product } from '../support/product.ts';
import { LONG_LESSON, MIXED_TITLE } from '../wave1/pages.ts';
import { WIDTHS, type Width } from '../wave1/world.ts';
import { englishBrowser } from './signin.ts';
import { HADEER, MONA, browserAs, editorPath, l2World, linkedHome, type L2World } from './world.ts';

export { LONG_LESSON, MIXED_TITLE };

/** The keys task L2 adds or changes in src/i18n/ui.ts (UX-16b's language check). */
export const L2_KEYS = [
  'forgotPassword', 'ownerRecovery', 'recoverOnlyOwner', 'backToSignIn', 'switchLanguage',
  'latestResultLine', 'correctedTag', 'lastOpenedLine', 'lastOpenedNone',
  'addMaterial', 'choiceFile', 'choiceVideo', 'choiceLink', 'choiceNote', 'materialAdded',
] as const;

export interface Sweep {
  w: L2World;
  fresh: Product;
  close(): Promise<void>;
}

/** The L2 world with the activity story, the longest made-up titles on the guardian home and in the editor, and a fresh product for /setup. */
export async function sweepWorld(): Promise<Sweep> {
  const w = await l2World({ story: true, kits: true });
  const s = w.school;
  await w.p.sql(`UPDATE lesson SET title = '${LONG_LESSON}' WHERE id = '${s.lessons['Reading decimals']}'`);
  // Both exams of the newest date take the mixed title, so the corrected "Quiz 3" (the lower id) stays the first row.
  await w.p.sql(`UPDATE exam SET title = '${MIXED_TITLE}' WHERE id IN ('l2-quiz3', 'l2-unit')`);
  await w.p.sql(`UPDATE material SET title = '${MIXED_TITLE}' WHERE lesson_id = '${s.lessons['Reading decimals']}'`);
  const fresh = await startProduct();
  return { w, fresh, close: async () => { await fresh.stop(); await w.close(); } };
}

export type Who = 'mona' | 'hadeer' | 'nobody';

/** One page of the sweep: who opens it, where, and what to do there first. */
export interface SweepPage {
  name: string;
  who: Who;
  path: (s: Sweep) => string;
  base?: 'fresh';
  then?: (page: Page) => Promise<void>;
}

const refuseDocx = async (page: Page) => {
  await page.fill('#add-file input[name=title]', MIXED_TITLE);
  await page.setInputFiles('#add-file input[name=file]', { name: 'worksheet.docx', mimeType: 'application/msword', buffer: Buffer.from('PK\u0003\u0004 not a pdf') });
  await Promise.all([page.waitForEvent('load'), page.click('#add-file button[type=submit]')]);
};

const addNote = async (page: Page) => {
  await page.fill('#add-note input[name=title]', LONG_LESSON);
  await page.fill('#add-note textarea[name=text]', 'A made-up note.');
  await Promise.all([page.waitForEvent('load'), page.click('#add-note button[type=submit]')]);
};

export const PAGES: SweepPage[] = [
  { name: 'guardian home', who: 'mona', path: (s) => linkedHome(s.w.school) },
  { name: 'editor, closed', who: 'hadeer', path: (s) => editorPath(s.w.school, s.w.school.lessons['Reading decimals']) },
  { name: 'editor, file form open', who: 'hadeer', path: (s) => editorPath(s.w.school, s.w.school.lessons['Reading decimals'], '?add=file') },
  { name: 'editor, a refusal', who: 'hadeer', path: (s) => editorPath(s.w.school, s.w.school.lessons['Reading decimals'], '?add=file'), then: refuseDocx },
  { name: 'editor, after an addition', who: 'hadeer', path: (s) => editorPath(s.w.school, s.w.school.lessons['Reading decimals'], '?add=note'), then: addNote },
  { name: '/signin', who: 'nobody', path: () => '/signin' },
  {
    name: '/signin, a failed answer', who: 'nobody', path: () => '/signin', then: async (page) => {
      await page.fill('form#signin input[name=username]', 'nobody.here');
      await page.fill('form#signin input[name=password]', 'not-a-password');
      await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
    },
  },
  { name: '/recover', who: 'nobody', path: () => '/recover' },
  { name: '/setup', who: 'nobody', base: 'fresh', path: () => '/setup' },
];

/** A tab for a person in a language (the language set in My account, or by the switch for nobody). */
export async function tabFor(browser: Browser, s: Sweep, who: Who, lang: 'ar' | 'en', width: Width = 'phone'): Promise<{ page: Page; close(): Promise<void> }> {
  if (who === 'nobody') {
    const { ctx, page } = await englishBrowser(browser, { width });
    for (const base of [s.w.p.url, s.fresh.url]) await page.goto(`${base}/signin?lang=${lang}`);
    return { page, close: () => ctx.close() };
  }
  const tab = await browserAs(browser, s.w, who === 'mona' ? MONA : HADEER, { lang, width });
  return { page: tab.page, close: () => tab.ctx.close() };
}

/** Opens a sweep page in a tab (and does its step). */
export async function open(page: Page, s: Sweep, p: SweepPage): Promise<void> {
  const base = p.base === 'fresh' ? s.fresh.url : s.w.p.url;
  const res = await page.goto(base + p.path(s));
  if (!res || res.status() >= 400) throw new Error(`${p.name}: ${res?.status()}`);
  if (p.then) await p.then(page);
}

export const sizes = (width: Width | 'reflow') => (width === 'reflow' ? { width: 320, height: 640 } : WIDTHS[width]);

/** The text a person reads on the page, without data (titles, names, usernames in <bdi> or dir="auto"), the
 * product's name and the space's name and logo text, and the language switch (UX-16b's allowlist). */
export async function wordsOnly(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('bdi, [dir=auto], input, textarea, select, script, style, #lang-switch, .brand, .space-header, .title, title').forEach((e) => e.remove());
    return body.innerText ?? body.textContent ?? '';
  });
}
