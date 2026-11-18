// LMS wave 3b, W3b-1: the UX floor items of ux-plan v2 on PIL-232, UX-36 to
// UX-43. W3b-1a: the upload, check and done pages and the people-list tag;
// W3b-1b: the send buttons, the person-page line, Earlier uploads (UX-40), the
// reset-link round trip (UX-43), and UX-41 and UX-42 for those pages. Each CI
// step selects its item by name ("^UX-<n> ") and saves
// only the screenshots the ux-plan names, under evidence/ux/. Playwright
// (Chromium), script on unless stated. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { measure, overflow, tab, type Focused } from '../wave1/ux.ts';
import {
  ADMIN, COMPANY_ADMIN, END, HEADER_EN, MIXED_NUMBERS, NOUR, SALMA, UNIVERSITY_ADMIN, as, browserAs, carriedForm, checkFile, classMixed, csv, pressAdd, uploadIdOf, uploadPath,
  uxShot, wave3bWorld, withNile, word, type Tab, type Wave3aWorld, type Width,
} from './world.ts';
import { WHOLE_FILES } from './pages.ts';
import { Client, utcDatePlusDays } from '../support/http.ts';

type Lang = 'ar' | 'en';
type Who = { username: string; password: string };
type Kit = 'school' | 'company' | 'university';
const STANDARD: [Width, Lang, Kit][] = [['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company']];
const ADMINS: Record<Kit, Who> = { school: ADMIN, company: COMPANY_ADMIN, university: UNIVERSITY_ADMIN };

/** The keys this task adds to src/i18n/ui.ts (UX-41, language check by key). */
const W3B_KEYS: UiKey[] = [
  'uploadEntry', 'uploadTitle', 'uploadStep1', 'uploadHow', 'uploadLimits', 'uploadSheet', 'uploadFile', 'uploadCheck', 'uploadCheckSaves',
  'checkTitle', 'checkNothingSaved', 'checkSkip', 'checkRefused', 'checkWillAdd', 'checkRowHead', 'checkReasons', 'checkAnother', 'checkNone', 'checkChanged',
  'uploadFailed', 'rowName', 'rowUsername', 'rowUsernameTaken', 'rowMobile', 'rowEndDate', 'fileNotCsv', 'fileNotUtf8', 'fileEmpty', 'filePassword',
  'doneAgain', 'doneNoPassword', 'noPasswordTag', 'passwordSetTag',
  // W3b-1b: the person-page line, the back link, Earlier uploads.
  'noPasswordLine', 'backToUpload', 'uploadsHeading', 'uploadsNone',
];
const ALLOWED = ['CSV', 'UTF-8', 'Excel', 'Google Sheets', 'WhatsApp'];

let w: Wave3aWorld;
let browser: Browser;
const tabs = new Map<string, Tab>();
const langOf = new Map<string, Lang>();
const spaceOf = (kit: Kit) => w[kit];

before(async () => {
  w = await wave3bWorld();
  browser = await chromium.launch();
});
after(async () => {
  for (const t of tabs.values()) await t.ctx.close();
  await browser?.close();
  await w?.close();
});

/** One signed-in browser per person, width and script setting (the language belongs to the person and is set when it changes). */
async function open(who: Who, lang: Lang, width: Width | 320 = 'phone', script = true): Promise<Page> {
  const key = `${who.username} ${width} ${script}`;
  let t = tabs.get(key);
  if (!t) {
    t = await browserAs(browser, w, who, { lang, width: width === 320 ? 'phone' : width, script });
    if (width === 320) await t.page.setViewportSize({ width: 320, height: 640 });
    tabs.set(key, t);
  } else if (langOf.get(who.username) !== lang) {
    await t.page.goto(w.p.url + '/account/language');
    await t.page.selectOption('form#language select[name=lang]', lang);
    await Promise.all([t.page.waitForEvent('load'), t.page.locator('form#language button[type=submit]').click()]);
  }
  langOf.set(who.username, lang);
  return t.page;
}

async function visit(page: Page, path: string, status = 200): Promise<void> {
  const res = await page.goto(w.p.url + path);
  assert.equal(res?.status(), status, `${path} answers ${status}`);
}

/** The upload page, a file chosen, "Check the file" pressed: the check page (or the refusal); returns the status. */
async function checkIn(page: Page, kit: Kit, content: string | Uint8Array, name = 'class.csv'): Promise<number> {
  await visit(page, uploadPath(spaceOf(kit)));
  await page.setInputFiles('#upload-file', { name, mimeType: 'text/csv', buffer: Buffer.from(content) });
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/upload/check')), page.waitForEvent('load'), page.click('#check-file')]);
  return res.status();
}

/** Presses Add and waits for the page it leads to; returns that page's status. */
async function add(page: Page): Promise<number> {
  const [res] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/upload/add')), page.waitForEvent('load'), page.click('#add')]);
  return res.status() === 303 ? 200 : res.status();
}

const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const order = (page: Page, ids: string[]) => page.evaluate((list) => list.map((id) => {
  const all = [...document.querySelectorAll('*')];
  return all.indexOf(document.getElementById(id)!);
}), ids);
const assertOrder = async (page: Page, ids: string[], what: string) => {
  const at = await order(page, ids);
  assert.ok(at.every((x) => x >= 0), `${what}: every part present (${ids.filter((_, i) => at[i] < 0)})`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, `${what}: in this order: ${ids.join(', ')}`);
};

/** A file of n passing rows (fresh usernames under a prefix). */
const passing = (prefix: string, n: number, end = END) => csv([HEADER_EN, ...Array.from({ length: n }, (_, i) => [`${prefix} Test ${i + 1}`, `${prefix}${i + 1}.t`, 'learner', `010464690${String(i % 100).padStart(2, '0')}`, end])]);
let fresh = 0;
const uniq = () => `ux${++fresh}x`;

// ------------------------------------------------------------------ UX-36 ----
describe('UX-36 upload entry and page order', { concurrency: false }, () => {
  it('UX-36 upload entry and page order: the entry link, the order, the bound label, accept, one primary button, the kit role words', async () => {
    for (const kit of ['school', 'company', 'university'] as const) {
      for (const lang of ['ar', 'en'] as const) {
        const page = await open(ADMINS[kit], lang);
        await visit(page, `/s/${spaceOf(kit).id}/admin/people`);
        const entry = page.locator('#upload-entry');
        assert.equal(await entry.evaluate((e) => e.tagName), 'A', `${kit} ${lang}: the entry is a link`);
        assert.equal(await entry.innerText(), word(lang, 'uploadEntry', {}, kit));
        assert.ok((await entry.boundingBox())!.height >= 44, `${kit} ${lang}: the entry is 44 px tall or more`);
        assert.match(await entry.getAttribute('class') ?? '', /\bbutton\b/, 'styled as a button');
        const nextToAppoint = await page.evaluate(() => {
          const h = [...document.querySelectorAll('h2')].find((e) => e.nextElementSibling?.contains(document.getElementById('upload-entry')));
          return !!h && h.nextElementSibling!.nextElementSibling !== null;
        });
        assert.ok(nextToAppoint, `${kit} ${lang}: next to "Appoint a person"`);
        await entry.click();
        await page.waitForLoadState('load');
        await assertOrder(page, ['upload-title', 'upload-step', 'columns', 'upload-limits', 'upload-sheet', 'upload-file', 'check-file', 'upload-saves'], `${kit} ${lang} upload page`);
        assert.equal(await page.locator('#columns > li').count(), 5, 'the five columns as a list');
        const label = await page.evaluate(() => {
          const input = document.getElementById('upload-file') as HTMLInputElement;
          const l = input.labels?.[0];
          return l ? { text: l.innerText.trim(), visible: l.getBoundingClientRect().height > 0 } : null;
        });
        assert.deepEqual(label, { text: word(lang, 'uploadFile', {}, kit), visible: true }, 'a visible label bound to the file field');
        assert.equal(await page.getAttribute('#upload-file', 'accept'), '.csv,text/csv');
        assert.equal(await page.getAttribute('form#upload', 'autocomplete'), 'off');
        assert.equal(await page.locator('main button, main input[type=submit]').count(), 1, 'one primary button');
        const button = (await page.locator('#check-file').boundingBox())!;
        const form = (await page.locator('form#upload').boundingBox())!;
        assert.ok(button.height >= 48, `Check the file is 48 px tall or more (${button.height})`);
        assert.ok(button.width >= form.width - 64, 'full width on phone');
        const roleLine = await page.locator('#role-line').innerText();
        for (const role of ['publisher', 'learner', 'guardian'] as const) {
          const kitWord = word(lang, role as UiKey, {}, kit);
          assert.ok(roleLine.includes(kitWord), `${kit} ${lang}: the role line names ${kitWord}`);
        }
        const dateLine = await page.locator('#date-line').innerText();
        assert.ok(dateLine.includes('2027-06-30') && dateLine.includes('30/06/2027'), 'both date forms');
      }
    }
    // The admin's own end date on the date line (Amal: W3b-c).
    const amal = await open(ADMIN, 'en');
    await visit(amal, uploadPath(w.school));
    assert.ok((await amal.locator('#date-line').innerText()).includes('2027-08-31'), 'the admin\'s own end date');
  });

  it('UX-36 screenshots: the standard set of the upload page', async () => {
    for (const [width, lang, kit] of STANDARD) {
      const page = await open(ADMINS[kit], lang, width);
      await visit(page, uploadPath(spaceOf(kit)));
      await uxShot(page, `UX-36-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
    }
  });
});

// ------------------------------------------------------------------ UX-37 ----
describe('UX-37 check page order and states', { concurrency: false }, () => {
  it('UX-37 check page order and states: order, focus on h1, skip link above 10, every reason, no full number, month dates, bdi, table and cards, N = 0', async () => {
    const page = await open(ADMIN, 'en');
    assert.equal(await checkIn(page, 'school', classMixed(), 'class-mixed.csv'), 200);
    await assertOrder(page, ['check-title', 'summary', 'refused-title', 'refused-rows', 'add-title', 'add-rows', 'actions'], 'check page');
    assert.equal(await page.getAttribute('#summary', 'role'), 'status');
    assert.equal(await page.getAttribute('#check-title', 'tabindex'), '-1');
    assert.equal(await focusedId(page), 'check-title', 'the h1 has focus on arrival');
    assert.equal(await page.locator('#skip').count(), 0, 'no skip link with 8 rows to add');
    assert.equal(await page.locator('#refused-rows tr[data-row="4"] li').count(), 2, 'row 4: both reasons');
    const visible = await page.locator('main').innerText();
    for (const n of MIXED_NUMBERS) for (const f of [n, n.replace('+20', '0')]) assert.ok(!visible.includes(f), `no full number ${f} in visible text`);
    assert.ok(visible.includes('30 June 2027'), 'the month as a word');
    const cells = await page.evaluate(() => [...document.querySelectorAll('#refused-rows td.name, #refused-rows td.username, #add-rows td.name, #add-rows td.username')]
      .map((td) => td.children.length === 1 && td.children[0].tagName === 'BDI'));
    assert.ok(cells.length >= 24 && cells.every(Boolean), 'every name and username in its own <bdi>');
    assert.equal(await page.getAttribute('#add-form', 'autocomplete'), 'off');
    assert.ok((await page.locator('#add').boundingBox())!.height >= 48, 'Add is 48 px tall or more');
    assert.equal(await page.locator('#another').getAttribute('href'), uploadPath(w.school), 'Choose another file goes back to the upload page');
    // Table from 768 px, cards below.
    for (const [width, table] of [[767, false], [768, true]] as const) {
      await page.setViewportSize({ width, height: 900 });
      const display = await page.evaluate(() => [getComputedStyle(document.querySelector('#add-rows thead')!).display, getComputedStyle(document.querySelector('#add-rows td')!).display]);
      assert.deepEqual(display, table ? ['table-header-group', 'table-cell'] : ['none', 'block'], `${width} px: ${table ? 'a table' : 'stacked cards'}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    // More than 10 rows to add: the skip link, which moves focus to Add.
    assert.equal(await checkIn(page, 'school', passing(uniq(), 11)), 200);
    await assertOrder(page, ['summary', 'skip', 'add-rows', 'add'], 'skip link above the rows');
    await page.click('#skip');
    assert.equal(await focusedId(page), 'add', 'the skip link moves focus to Add');
    // N = 0: the checkNone line and only "Choose another file".
    assert.equal(await checkIn(page, 'school', csv([HEADER_EN, ['None Test', 'salma.a', 'Student', '01046469901', END]])), 200);
    assert.equal(await page.locator('#check-none').innerText(), UI.en.checkNone);
    assert.equal(await page.locator('#add, #add-form').count(), 0, 'no Add button');
    assert.equal(await page.locator('#actions a, #actions button').count(), 1, 'only Choose another file');
  });

  it('UX-37 screenshots: the standard set with class-mixed.csv, no row can be added, the English table', async () => {
    for (const [width, lang, kit] of STANDARD) {
      const page = await open(ADMINS[kit], lang, width);
      const file = kit === 'school' ? classMixed() : csv([HEADER_EN, ['Company Test', 'company.ux.t', 'Employee', '01046469902', new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)], ['Company Bad', 'basem.admin', 'Employee', '0104', END]]);
      assert.equal(await checkIn(page, kit, file, 'class-mixed.csv'), 200);
      await uxShot(page, `UX-37-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
    }
    const ar = await open(ADMIN, 'ar');
    await checkIn(ar, 'school', csv([HEADER_EN, ['None Test', 'salma.a', 'Student', '01046469901', END]]));
    await uxShot(ar, 'UX-37-phone-ar-none');
    const en = await open(ADMIN, 'en', 'desktop');
    await checkIn(en, 'school', classMixed(), 'class-mixed.csv');
    await uxShot(en, 'UX-37-desktop-en-table');
  });
});

// ------------------------------------------------------------------ UX-38 ----
describe('UX-38 refusal, changed, failed and second-press states', { concurrency: false }, () => {
  it('UX-38 refusal, changed, failed and second-press states: each message, role, focus target and status', async () => {
    const page = await open(ADMIN, 'en');
    // Whole-file refusals: 400, the alert above the form, focused, saying what to do.
    for (const f of WHOLE_FILES) {
      assert.equal(await checkIn(page, 'school', f.content), 400, `${f.name}: 400`);
      assert.equal(await page.locator('#refusal').innerText(), f.message, `${f.name}: the message`);
      assert.equal(await page.getAttribute('#refusal', 'role'), 'alert');
      assert.equal(await page.getAttribute('#refusal', 'tabindex'), '-1');
      assert.equal(await focusedId(page), 'refusal', `${f.name}: the alert takes focus`);
      await assertOrder(page, ['refusal', 'upload'], `${f.name}: above the form`);
    }
    // Changed since the check: 409, the alert above the summary, focused instead of the h1.
    assert.equal(await checkIn(page, 'school', passing(uniq(), 2)), 200);
    await page.evaluate(() => void ((document.querySelector('input[name=fp]') as HTMLInputElement).value = 'changed'));
    assert.equal(await add(page), 409);
    assert.equal(await page.locator('#notice').innerText(), UI.en.checkChanged);
    assert.equal(await page.getAttribute('#notice', 'role'), 'alert');
    await assertOrder(page, ['notice', 'check-title', 'summary'], 'changed: at the top');
    assert.equal(await focusedId(page), 'notice', 'changed: the alert takes focus');
    // A failed add: the check page again with the same alert block.
    w.p.faults!.set({ rewrite: (sql, p) => (/^\s*INSERT INTO class_upload/.test(sql) ? ['INSERT INTO no_such_table VALUES (1)', []] : [sql, p]) });
    try {
      assert.equal(await add(page), 500);
    } finally {
      w.p.faults!.set({});
    }
    assert.equal(await page.locator('#notice').innerText(), UI.en.uploadFailed);
    assert.equal(await page.getAttribute('#notice', 'role'), 'alert');
    assert.equal(await focusedId(page), 'notice', 'failed: the alert takes focus');
    // Second press with script: the button is disabled and busy, a double click sends one request.
    // (In a fresh signed-in tab, as a person who just chose a file.)
    const once = await browserAs(browser, w, ADMIN, { lang: 'en' });
    try {
      assert.equal(await checkIn(once.page, 'school', passing(uniq(), 1)), 200);
      let posts = 0;
      once.page.on('request', (r) => void (r.method() === 'POST' && r.url().endsWith('/upload/add') && posts++));
      // The button's state as the page changes it, reported out of the page (the answer may replace the page quickly).
      const states: [boolean, string | null][] = [];
      await once.page.exposeFunction('reportAdd', (disabled: boolean, busy: string | null) => void states.push([disabled, busy]));
      await once.page.evaluate(() => {
        const b = document.getElementById('add') as HTMLButtonElement;
        new MutationObserver(() => (window as unknown as { reportAdd(d: boolean, b: string | null): void }).reportAdd(b.disabled, b.getAttribute('aria-busy'))).observe(b, { attributes: true });
      });
      await once.page.dblclick('#add', { noWaitAfter: true });
      await once.page.waitForURL(/\/admin\/upload\/[0-9a-f-]{36}$/);
      assert.ok(states.some(([d, b]) => d && b === 'true'), `disabled and busy after the first press: ${JSON.stringify(states)}`);
      assert.equal(posts, 1, 'a double click sends one request');
    } finally {
      await once.ctx.close();
    }
    // Second press without script: the done page with doneAgain in a status block that takes focus.
    const plain = await open(ADMIN, 'en', 'phone', false);
    assert.equal(await checkIn(plain, 'school', passing(uniq(), 1)), 200);
    const form = await plain.evaluate(() => ({ text: (document.querySelector('input[name=text]') as HTMLInputElement).value, fp: (document.querySelector('input[name=fp]') as HTMLInputElement).value }));
    await add(plain);
    const res = await plain.request.post(`${w.p.url}${uploadPath(w.school)}/add`, { form, maxRedirects: 0, headers: { origin: w.p.url } });
    assert.equal(res.status(), 303, 'the second press answers 303');
    await visit(plain, res.headers().location);
    assert.equal(await plain.locator('#again').innerText(), UI.en.doneAgain);
    assert.equal(await plain.getAttribute('#again', 'role'), 'status');
    await assertOrder(plain, ['again', 'done-title'], 'at the top');
  });

  it('UX-38 screenshots: not UTF-8, a password column, changed since the check, second press', async () => {
    const ar = await open(ADMIN, 'ar');
    await checkIn(ar, 'school', WHOLE_FILES.find((f) => f.name.includes('1256'))!.content);
    await uxShot(ar, 'UX-38-phone-ar-notutf8');
    const en = await open(ADMIN, 'en');
    await checkIn(en, 'school', WHOLE_FILES.find((f) => f.name.includes('Password'))!.content);
    await uxShot(en, 'UX-38-phone-en-password');
    const ar2 = await open(ADMIN, 'ar');
    await checkIn(ar2, 'school', passing(uniq(), 2));
    await ar2.evaluate(() => void ((document.querySelector('input[name=fp]') as HTMLInputElement).value = 'changed'));
    await add(ar2);
    await uxShot(ar2, 'UX-38-phone-ar-changed');
    await checkIn(ar2, 'school', passing(uniq(), 2));
    const form = await ar2.evaluate(() => ({ text: (document.querySelector('input[name=text]') as HTMLInputElement).value, fp: (document.querySelector('input[name=fp]') as HTMLInputElement).value }));
    await add(ar2);
    const res = await ar2.request.post(`${w.p.url}${uploadPath(w.school)}/add`, { form, maxRedirects: 0, headers: { origin: w.p.url } });
    await visit(ar2, res.headers().location);
    await uxShot(ar2, 'UX-38-phone-ar-again');
  });
});

// ------------------------------------------------------------------ UX-39 ----
describe('UX-39 done page and no-password tag', { concurrency: false }, () => {
  it('UX-39 done page and no-password tag: order, focus, the tags (text, with a 3:1 border), the people list, Password set after a password is set', async () => {
    const page = await open(ADMIN, 'en');
    const prefix = uniq();
    await checkIn(page, 'school', passing(prefix, 3));
    assert.equal(await add(page), 200);
    const done = page.url();
    await assertOrder(page, ['done-title', 'done-meta', 'done-no-password', 'added', 'back-people', 'to-group'], 'done page');
    assert.equal(await focusedId(page), 'done-title', 'the h1 has focus on arrival');
    const rows = await page.evaluate(() => [...document.querySelectorAll('#added > li')].map((li) => {
      const send = li.querySelector('a.send-link') as HTMLElement | null;
      return {
        anchor: li.id, link: li.querySelector('a.person')?.getAttribute('href') ?? '', tag: li.querySelector('.tag')?.textContent ?? '', buttons: li.querySelectorAll('button, a.button').length,
        send: send ? { href: send.getAttribute('href'), text: send.innerText.trim(), height: send.getBoundingClientRect().height, afterName: !!(li.querySelector('a.person')!.compareDocumentPosition(send) & 4) } : null,
      };
    }));
    assert.equal(rows.length, 3);
    const uploadId = new URL(done).pathname.split('/').pop();
    for (const r of rows) {
      assert.match(r.anchor, /^p-[0-9a-f-]{36}$/, 'anchor p-<userId>');
      assert.equal(r.link, `/s/${w.school.id}/admin/people/${r.anchor.slice(2)}`, 'the name links to the person page');
      assert.equal(r.tag, UI.en.noPasswordTag);
      assert.equal(r.buttons, 1, 'one button: Send reset link by WhatsApp');
      assert.deepEqual(r.send && { href: r.send.href, text: r.send.text, afterName: r.send.afterName },
        { href: `/s/${w.school.id}/admin/people/${r.anchor.slice(2)}/link?back=${uploadId}`, text: UI.en.sendResetLink, afterName: true }, 'the send button opens today\'s confirmation with back');
      assert.ok(r.send!.height >= 44, `the send button is 44 px tall or more (${r.send!.height})`);
    }
    const border = async (sel: string) => page.evaluate((s) => {
      const el = document.querySelector(s)!;
      const rgb = (x: string) => (x.match(/[\d.]+/g) ?? []).map(Number);
      const lum = ([r, g, b]: number[]) => [r, g, b].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      let bg = [255, 255, 255];
      for (let e = el.parentElement; e; e = e.parentElement) {
        const c = rgb(getComputedStyle(e).backgroundColor);
        if (c.length === 3 || c[3] === 1) { bg = c.slice(0, 3); break; }
      }
      const a = lum(rgb(getComputedStyle(el).borderTopColor));
      const b = lum(bg);
      return { width: parseFloat(getComputedStyle(el).borderTopWidth), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    }, sel);
    const tagBorder = await border('#added .tag');
    assert.ok(tagBorder.width >= 1 && tagBorder.ratio >= 3, `the tag has a border of 3:1 or more (${tagBorder.ratio.toFixed(2)})`);
    // The person page: the line above the reset link block.
    await visit(page, `/s/${w.school.id}/admin/people/${rows[0].anchor.slice(2)}`);
    assert.equal(await page.locator('#no-password-line').innerText(), UI.en.noPasswordLine);
    await assertOrder(page, ['no-password-line', 'send-link'], 'person page: the line above the reset link block');
    // The people list shows the tag next to the person.
    const firstId = rows[0].anchor.slice(2);
    await visit(page, `/s/${w.school.id}/admin/people`);
    assert.equal(await page.locator(`li[data-user="${firstId}"] [data-tag="no-password"]`).innerText(), UI.en.noPasswordTag);
    const listBorder = await border(`li[data-user="${firstId}"] [data-tag="no-password"]`);
    assert.ok(listBorder.ratio >= 3, `people list tag border ${listBorder.ratio.toFixed(2)}`);
    // After a password is set (Set a new password): the tag is gone; the done page shows "Password set" and no button.
    const amal = await open(ADMIN, 'en');
    await amal.goto(`${w.p.url}/s/${w.school.id}/admin/people/${firstId}`);
    await amal.fill('input[name=new_password]', 'ux-thirty-nine-pass');
    await Promise.all([amal.waitForEvent('load'), amal.locator('form:has(input[name=new_password]) button[type=submit]').click()]);
    assert.equal(await amal.locator('#no-password-line').count(), 0, 'the person page line is gone');
    await visit(amal, `/s/${w.school.id}/admin/people`);
    assert.equal(await amal.locator(`li[data-user="${firstId}"] [data-tag="no-password"]`).count(), 0, 'the tag is gone from the people list');
    await amal.goto(w.p.url + new URL(done).pathname);
    assert.equal(await amal.locator(`#p-${firstId} .tag`).innerText(), UI.en.passwordSetTag, '"Password set"');
    assert.equal(await amal.locator(`#p-${firstId} button, #p-${firstId} a.button`).count(), 0, 'no button');
  });

  it('UX-39 screenshots: the standard set of the done page, a person page with the line', async () => {
    let someone = '';
    for (const [width, lang, kit] of STANDARD) {
      const page = await open(ADMINS[kit], lang, width);
      const end = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      await checkIn(page, kit, passing(uniq(), 3, end));
      assert.equal(await add(page), 200, `${width} ${lang} ${kit}: the done page`);
      await uxShot(page, `UX-39-${width}-${lang}${kit === 'school' ? '' : `-${kit}`}`);
      if (kit === 'school') someone ||= (await page.locator('#added a.person').first().getAttribute('href'))!;
    }
    const ar = await open(ADMIN, 'ar');
    await visit(ar, someone);
    assert.equal(await ar.locator('#no-password-line').innerText(), UI.ar.noPasswordLine);
    await uxShot(ar, 'UX-39-phone-ar-person');
  });
});

// ------------------------------------------------------------------ UX-40 ----
describe('UX-40 earlier uploads list', { concurrency: false }, () => {
  it('UX-40 earlier uploads list: the heading, newest first, at most 10, link targets, the empty state, only this space\'s uploads', async () => {
    const { id: nileId, nour } = await withNile(w);
    const nile = { id: nileId };
    const page = await open(NOUR, 'en');
    await visit(page, uploadPath(nile));
    await assertOrder(page, ['upload', 'uploads-title', 'uploads-none'], 'Earlier uploads below the form');
    assert.equal(await page.locator('#uploads-title').innerText(), UI.en.uploadsHeading);
    assert.equal(await page.locator('#uploads-none').innerText(), UI.en.uploadsNone, 'the empty state');
    assert.equal(await page.locator('#uploads a').count(), 0);
    // Eleven Nile uploads, on eleven days.
    void (await nour.post('/account/language', { lang: 'en' }));
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) {
      const html = await (await checkFile(nour, nile, csv([HEADER_EN, [`Forty ${i} Test`, `${uniq()}.t`, 'Student', `010464640${String(i).padStart(2, '0')}`, utcDatePlusDays(30)]]))).text();
      ids.push(uploadIdOf((await pressAdd(nour, nile, carriedForm(html)!)).headers.get('location')));
    }
    for (const [i, id] of ids.entries()) await w.p.sql(`UPDATE class_upload SET uploaded_at = ${Date.UTC(2026, 9, 1 + i, 8)} WHERE id = '${id}'`);
    await visit(page, uploadPath(nile));
    const links = await page.evaluate(() => [...document.querySelectorAll('#uploads a')].map((a) => ({ id: a.id, href: a.getAttribute('href'), text: (a as HTMLElement).innerText.trim(), h: a.getBoundingClientRect().height })));
    const months = UI.en.monthWords.split(',');
    assert.deepEqual(links.map((l) => l.href), ids.slice(1).reverse().map((id) => `/s/${nileId}/admin/upload/${id}`), 'newest first, at most 10, each to its done page');
    assert.deepEqual(links.map((l) => l.text), ids.slice(1).reverse().map((_, k) => `${11 - k} ${months[9]} 2026, ${NOUR.display_name}: added 1, refused 0`), 'the row text');
    assert.ok(links.every((l) => l.h >= 44), 'each link 44 px tall or more');
    assert.equal(await page.locator('#uploads-none').count(), 0, 'no empty state');
    await Promise.all([page.waitForEvent('load'), page.click(`#${links[0].id}`)]);
    assert.equal(await page.locator('#done-title').innerText(), UI.en.doneTitle.replace('{n}', '1'), 'the link opens the done page');
    // Only this space's: Amal's list has none of Nile's.
    const amal = await open(ADMIN, 'en');
    await visit(amal, uploadPath(w.school));
    const meskHrefs = await amal.evaluate(() => [...document.querySelectorAll('#uploads a')].map((a) => a.getAttribute('href') ?? ''));
    assert.ok(meskHrefs.length > 0 && meskHrefs.every((h) => h.startsWith(`/s/${w.school.id}/admin/upload/`)), 'Mesk\'s list holds only Mesk\'s uploads');
  });

  it('UX-40 screenshots: the Arabic upload page with earlier uploads', async () => {
    const page = await open(ADMIN, 'ar');
    await checkIn(page, 'school', passing(uniq(), 1));
    await add(page);
    await visit(page, uploadPath(w.school));
    assert.ok((await page.locator('#uploads a').count()) > 0);
    await uxShot(page, 'UX-40-phone-ar');
  });
});

// ------------------------------------------------------------------ UX-43 ----
describe('UX-43 reset link round trip from the done page', { concurrency: false }, () => {
  it('UX-43 reset link round trip from the done page: three people in turn, the back link, focus on the row, Password set; a foreign or forged back changes nothing', async () => {
    const page = await open(ADMIN, 'en');
    const prefix = uniq();
    await checkIn(page, 'school', passing(prefix, 3));
    assert.equal(await add(page), 200);
    const done = new URL(page.url()).pathname;
    const uploadId = done.split('/').pop()!;
    const people = await page.evaluate(() => [...document.querySelectorAll('#added > li')].map((li) => li.id.slice(2)));
    const tokens: string[] = [];
    for (const id of people) {
      await visit(page, done);
      let navigations = 0;
      const count = () => void navigations++;
      page.on('framenavigated', count);
      await Promise.all([page.waitForEvent('load'), page.click(`#p-${id} a.send-link`)]);
      page.off('framenavigated', count);
      assert.equal(navigations, 1, 'one tap to the confirmation');
      assert.ok(page.url().endsWith(`/people/${id}/link?back=${uploadId}`));
      await assertOrder(page, ['confirm-link', 'back-upload'], 'confirmation: Back to the upload after today\'s action');
      for (const m of await measure(page, '#back-upload')) assert.ok(m.height >= 44 && m.width >= 44, `confirmation back link ${m.width}x${m.height}`);
      assert.equal(await page.getAttribute('#back-upload', 'href'), `${done}#p-${id}`);
      await Promise.all([page.waitForEvent('load'), page.click('#confirm-link button')]);
      await assertOrder(page, ['copy', 'reset-link', 'back-upload'], 'link page: Back to the upload after today\'s actions');
      for (const m of await measure(page, '#back-upload')) assert.ok(m.height >= 44 && m.width >= 44, `link page back link ${m.width}x${m.height}`);
      assert.equal(await page.getAttribute('#back-upload', 'class'), 'button plain secondary-link', 'a secondary link');
      tokens.push(/\/r\/([A-Za-z0-9_-]+)$/.exec(await page.locator('#reset-link').inputValue())![1]);
      await Promise.all([page.waitForEvent('load'), page.click('#back-upload')]);
      assert.equal(new URL(page.url()).hash, `#p-${id}`, 'back at the row');
      const focused = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        return { row: a.closest('li')?.id, person: a.matches('a.person') };
      });
      assert.deepEqual(focused, { row: `p-${id}`, person: true }, 'focus on the person\'s name link');
    }
    // One sets a password: the button is gone and "Password set" is shown.
    const c = await as(w, ADMIN, 'en');
    const set = await new Client(w.p.url).post(`/r/${tokens[1]}`, { username: `${prefix}2.t`, new_password: 'ux-forty-three-pass' });
    assert.equal(set.status, 200);
    await visit(page, done);
    assert.equal(await page.locator(`#p-${people[1]} .tag`).innerText(), UI.en.passwordSetTag);
    assert.equal(await page.locator(`#p-${people[1]} a.button, #p-${people[1]} button`).count(), 0, 'the button is gone');
    // Without back, or with a back that is not an upload of this space that added this person: exactly today's pages.
    const { id: nileId, nour } = await withNile(w);
    void (await nour.post('/account/language', { lang: 'en' }));
    const nileHtml = await (await checkFile(nour, { id: nileId }, csv([HEADER_EN, [`Nile Back Test`, `${uniq()}.t`, 'Student', '01046464399', utcDatePlusDays(30)]]))).text();
    const nileUpload = uploadIdOf((await pressAdd(nour, { id: nileId }, carriedForm(nileHtml)!)).headers.get('location'));
    const other = await checkFile(c, w.school, passing(uniq(), 1));
    const otherUpload = uploadIdOf((await pressAdd(c, w.school, carriedForm(await other.text())!)).headers.get('location'));
    const salma = String((await w.p.sql(`SELECT id FROM user WHERE username = '${SALMA.username}'`))[0].id);
    const main = (html: string) => (html.match(/<main[\s\S]*<\/main>/)?.[0] ?? html).replace(/(\/|%2F)r(\/|%2F)[A-Za-z0-9_-]+/g, '/r/<token>');
    for (const [who, person] of [['a new person', people[0]], ['Salma (added by hand)', salma]] as const) {
      const base = `/s/${w.school.id}/admin/people/${person}/link`;
      const today = main(await (await c.get(base)).text());
      const todayLink = main(await (await c.post(base, {})).text());
      assert.ok(!today.includes(UI.en.backToUpload) && !todayLink.includes(UI.en.backToUpload), `${who}: no back link without back`);
      const forged = [nileUpload, otherUpload, crypto.randomUUID(), 'x"><a href=//other.example>', `${uploadId}/../../`];
      if (who === 'Salma (added by hand)') forged.push(uploadId);
      for (const back of forged) {
        const q = `?back=${encodeURIComponent(back)}`;
        assert.equal(main(await (await c.get(base + q)).text()), today, `${who}, back=${back}: today's confirmation, unchanged`);
        assert.equal(main(await (await c.post(base + q, {})).text()), todayLink, `${who}, back=${back}: today's link page, unchanged`);
      }
    }
  });

  it('UX-43 screenshots: the Arabic link page with Back to the upload', async () => {
    const page = await open(ADMIN, 'ar');
    await checkIn(page, 'school', passing(uniq(), 1));
    await add(page);
    await Promise.all([page.waitForEvent('load'), page.click('#added a.send-link')]);
    await Promise.all([page.waitForEvent('load'), page.click('#confirm-link button')]);
    assert.equal(await page.locator('#back-upload').innerText(), UI.ar.backToUpload);
    await uxShot(page, 'UX-43-phone-ar-link');
  });
});

// ------------------------------------------------------------------ UX-41 ----
describe('UX-41 Arabic, mixed text and kit words for the upload (three kits)', { concurrency: false }, () => {
  it('UX-41 Arabic, mixed text and kit words for the upload (three kits): lang and dir, bdi, mirroring, language by key, kit words, the empty sheet', async () => {
    const visibleText = (page: Page) => page.evaluate(() => (document.querySelector('main') as HTMLElement).innerText);
    const values = (lang: Lang) => W3B_KEYS.map((k) => UI[lang][k]).filter((v) => !ALLOWED.includes(v));
    for (const lang of ['ar', 'en'] as const) {
      const other = lang === 'ar' ? 'en' : 'ar';
      const page = await open(ADMIN, lang, 'desktop');
      const pages: [string, () => Promise<unknown>][] = [
        ['upload page', () => visit(page, uploadPath(w.school))],
        ['check page', () => checkIn(page, 'school', classMixed())],
        ['done page', async () => {
          await checkIn(page, 'school', passing(uniq(), 2));
          await add(page);
        }],
        // W3b-1b: Earlier uploads, the person-page line, the reset-link pages with back.
        ['upload page with earlier uploads', () => visit(page, uploadPath(w.school))],
        ['person page with the line', async () => {
          await Promise.all([page.waitForEvent('load'), page.click('#uploads a')]);
          await Promise.all([page.waitForEvent('load'), page.click('#added a.person')]);
          assert.equal(await page.locator('#no-password-line').count(), 1);
        }],
        ['confirmation with back', async () => {
          await page.goBack();
          await Promise.all([page.waitForEvent('load'), page.click('#added a.send-link')]);
          assert.equal(await page.locator('#back-upload').count(), 1);
        }],
        ['link page with back', async () => {
          await Promise.all([page.waitForEvent('load'), page.click('#confirm-link button')]);
          assert.equal(await page.locator('#back-upload').count(), 1);
        }],
      ];
      for (const [name, go] of pages) {
        await go();
        assert.equal(await page.getAttribute('html', 'lang'), lang, `${lang} ${name}: lang`);
        assert.equal(await page.getAttribute('html', 'dir'), lang === 'ar' ? 'rtl' : 'ltr', `${lang} ${name}: dir`);
        const text = await visibleText(page);
        for (const v of values(other)) assert.ok(!text.includes(v), `${lang} ${name}: no ${other} text "${v.slice(0, 40)}"`);
      }
    }
    // Usernames, row numbers, dates and the mobile digits never flip; tables mirror in Arabic (row number at the right).
    const ar = await open(ADMIN, 'ar', 'desktop');
    await checkIn(ar, 'school', classMixed());
    const iso = await ar.evaluate(() => [...document.querySelectorAll('#add-rows tr[data-row]')].map((tr) => {
      const tds = [...tr.querySelectorAll('td')];
      const isolated = (td: Element) => !!td.querySelector('bdi') || td.getAttribute('dir') === 'ltr';
      return { row: isolated(tds[0]), user: isolated(tds[2]), mobile: isolated(tds[4]), date: isolated(tds[5]), right: tds[0].getBoundingClientRect().left > tds[5].getBoundingClientRect().left };
    }));
    assert.ok(iso.length === 8 && iso.every((r) => r.row && r.user && r.mobile && r.date), `row numbers, usernames, mobile digits and dates are isolated: ${JSON.stringify(iso[0])}`);
    assert.ok(iso.every((r) => r.right), 'the row number is at the right in Arabic');
    // Earlier uploads: the date, the admin's name and the counts each in their own bdi.
    await visit(ar, uploadPath(w.school));
    const rowsIso = await ar.evaluate(() => [...document.querySelectorAll('#uploads a')].map((a) => a.querySelectorAll('bdi').length));
    assert.ok(rowsIso.length > 0 && rowsIso.every((n) => n === 4), `each earlier upload row isolates its date, name and two counts: ${JSON.stringify(rowsIso)}`);
    // Kit words: the role line and the role refusal in each kit and language.
    for (const kit of ['school', 'company', 'university'] as const) {
      for (const lang of ['ar', 'en'] as const) {
        const page = await open(ADMINS[kit], lang);
        await visit(page, uploadPath(spaceOf(kit)));
        const roles = ['publisher', 'learner', 'guardian'].map((r) => word(lang, r as UiKey, {}, kit));
        const line = await page.locator('#role-line').innerText();
        for (const r of roles) assert.ok(line.includes(r), `${kit} ${lang}: role line has ${r}`);
        await checkIn(page, kit, csv([HEADER_EN, ['Kit Word', `kit${kit}${lang}.t`, 'Administrator', '01046469950', new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)]]));
        const reason = await page.locator('#refused-rows li[data-reason="rowRole"]').innerText();
        for (const r of roles) assert.ok(reason.includes(r), `${kit} ${lang}: the refusal names ${r}`);
      }
      // The empty sheet: the space's first language, with a byte-order mark.
      const page = await open(ADMINS[kit], 'en');
      const res = await page.request.get(`${w.p.url}${uploadPath(spaceOf(kit))}/sheet.csv`);
      const bytes = await res.body();
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${kit}: UTF-8 byte-order mark`);
      assert.ok(/[؀-ۿ]/.test(bytes.subarray(3).toString('utf8')), `${kit}: the header in Arabic (the space's first language)`);
    }
  });

  it('UX-41 screenshots: the University upload page, a check page of mixed text', async () => {
    const uni = await open(UNIVERSITY_ADMIN, 'ar');
    await visit(uni, uploadPath(w.university));
    await uxShot(uni, 'UX-41-phone-ar-university');
    const ar = await open(ADMIN, 'ar');
    await checkIn(ar, 'school', csv([HEADER_EN, ['منى اختبار', 'mona.mix.t', 'طالب', '٠١٠٤٦٤٦٩٩٦٠', '٣٠/٠٦/٢٠٢٧'], ['يوسف اختبار', 'youssef.mix.t', 'معلم', '٠١٠٤٦٤٦٩٩٦١', '2027-06-30']]));
    await uxShot(ar, 'UX-41-phone-ar-mixed');
  });
});

// ------------------------------------------------------------------ UX-42 ----
describe('UX-42 keyboard, widths, sizes and contrast for the upload', { concurrency: false }, () => {
  /** Tab presses from the top of the page until focus leaves the page or comes round again. */
  async function stops(page: Page): Promise<Focused[]> {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Home');
    const out: Focused[] = [];
    for (let i = 0; i < 400; i++) {
      const f = await tab(page);
      if (f.tag === 'body' || out.some((o) => o.id && o.id === f.id && o.text === f.text && i > 2 && o === out[0])) break;
      if (out.length && f.id === out[0].id && f.text === out[0].text) break;
      out.push(f);
    }
    return out;
  }

  it('UX-42 keyboard, widths, sizes and contrast for the upload: tab order, reflow at four widths, 44 px controls, 14 px text, focus rings', async (t) => {
    const page = await open(ADMIN, 'en', 'desktop');
    // Tab order: upload page.
    await visit(page, uploadPath(w.school));
    let s = (await stops(page)).filter((f) => f.region === 'content');
    const earlier = await page.evaluate(() => [...document.querySelectorAll('#uploads a')].map((a) => a.id));
    assert.deepEqual(s.map((f) => f.id), ['upload-sheet', 'upload-file', 'check-file', ...earlier], 'upload page: empty sheet, file field, Check the file, earlier uploads');
    for (const f of s) assert.ok(f.visible && f.ringPx >= 2 && f.ringContrast >= 3, `upload page ${f.id}: ring ${f.ringPx} px, ${f.ringContrast.toFixed(2)}`);
    // Check page: skip link, no stop inside a row, Add, Choose another file.
    await checkIn(page, 'school', passing(uniq(), 11));
    s = (await stops(page)).filter((f) => f.region === 'content');
    assert.deepEqual(s.map((f) => f.id), ['skip', 'add', 'another'], 'check page: skip, Add, Choose another file');
    for (const f of s) assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `check page ${f.id}: ring ${f.ringPx} px, ${f.ringContrast.toFixed(2)}`);
    // Done page: each name in order, then Back to people, Add people to a group.
    await add(page);
    s = (await stops(page)).filter((f) => f.region === 'content');
    const names = await page.evaluate(() => [...document.querySelectorAll('#added > li')].flatMap((li) => [(li.querySelector('a.person') as HTMLElement).innerText.trim(), li.querySelector('a.send-link')?.id ?? '']));
    assert.deepEqual(s.map((f) => f.id || f.text), [...names, 'back-people', 'to-group'], 'done page: each name, then their button, then Back to people, Add people to a group');
    for (const f of s) assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `done page ${f.id || f.text}: ring ${f.ringPx} px`);
    // The focused h1 and alert blocks carry the ring too.
    for (const sel of ['#done-title']) {
      const ring = await page.evaluate((x) => {
        const el = document.querySelector(x) as HTMLElement;
        el.focus();
        const cs = getComputedStyle(el);
        return cs.outlineStyle !== 'none' ? parseFloat(cs.outlineWidth) : 0;
      }, sel);
      assert.ok(ring >= 2, `${sel}: a focus ring of 2 px or more`);
    }
    // With uploads made, the upload page's last stops are the earlier uploads, newest first.
    await visit(page, uploadPath(w.school));
    s = (await stops(page)).filter((f) => f.region === 'content');
    const listed = await page.evaluate(() => [...document.querySelectorAll('#uploads a')].map((a) => a.id));
    assert.ok(listed.length > 0, 'earlier uploads listed');
    assert.deepEqual(s.map((f) => f.id), ['upload-sheet', 'upload-file', 'check-file', ...listed], 'upload page with earlier uploads');
    for (const f of s) assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `upload page ${f.id}: ring ${f.ringPx} px`);
    // The reset-link pages with back: Back to the upload after today's actions, with the ring.
    await Promise.all([page.waitForEvent('load'), page.click('#uploads a')]);
    await Promise.all([page.waitForEvent('load'), page.click('#added a.send-link')]);
    s = (await stops(page)).filter((f) => f.region === 'content');
    assert.equal(s.at(-1)?.id, 'back-upload', 'confirmation: Back to the upload is the last stop');
    assert.ok(s.at(-1)!.ringPx >= 2 && s.at(-1)!.ringContrast >= 3, 'confirmation back link ring');
    await Promise.all([page.waitForEvent('load'), page.click('#confirm-link button')]);
    s = (await stops(page)).filter((f) => f.region === 'content');
    assert.equal(s.at(-1)?.id, 'back-upload', 'link page: Back to the upload is the last stop');
    assert.ok(s.at(-1)!.ringPx >= 2 && s.at(-1)!.ringContrast >= 3, 'link page back link ring');
    // Widths: 100 rows of 100-character names and 32-character usernames, Arabic and English, at 320, 390, 768 and 1280 px.
    const long = csv([HEADER_EN, ...Array.from({ length: 100 }, (_, i) => [('اسم طويل جدا للاختبار ' + 'Long Name ').repeat(4).slice(0, 96) + String(i).padStart(4, '0'),
      `w${String(i).padStart(3, '0')}.${'u'.repeat(27)}`, 'Student', `010464690${String(i).padStart(2, '0')}`, END])]);
    const checked: string[] = [];
    for (const lang of ['ar', 'en'] as const) {
      for (const width of [320, 'phone', 'tablet', 'desktop'] as const) {
        const p = await open(ADMIN, lang, width);
        for (const [name, go] of [
          ['upload', () => visit(p, uploadPath(w.school))],
          ['check', () => checkIn(p, 'school', long)],
          ['done', async () => {
            await checkIn(p, 'school', passing(uniq(), 3));
            await add(p);
          }],
          // W3b-1b: the person page with the line, the reset-link pages with back, the upload page with earlier uploads.
          ['person', () => Promise.all([p.waitForEvent('load'), p.click('#added a.person')])],
          ['confirmation with back', async () => {
            await p.goBack();
            await Promise.all([p.waitForEvent('load'), p.click('#added a.send-link')]);
          }],
          ['link with back', () => Promise.all([p.waitForEvent('load'), p.click('#confirm-link button')])],
          ['upload with earlier uploads', () => visit(p, uploadPath(w.school))],
        ] as const) {
          await go();
          const o = await overflow(p);
          assert.ok(o.sideways <= 0, `${lang} ${width} ${name}: no sideways scroll (${o.sideways} px)`);
          const clipped = o.clipped.filter((c) => !/^(html|body|main|table|tbody|thead|tr)\b/.test(c));
          assert.deepEqual(clipped, [], `${lang} ${width} ${name}: no clipped text`);
          checked.push(`${lang}/${width}/${name}`);
        }
      }
    }
    t.diagnostic(`widths checked: ${checked.join(', ')}`);

    // Sizes and contrast of every new control and new text.
    for (const lang of ['ar', 'en'] as const) {
      const p = await open(ADMIN, lang);
      await visit(p, uploadPath(w.school));
      for (const sel of ['#upload-sheet', '#check-file']) for (const m of await measure(p, sel)) assert.ok(m.width >= 44 && m.height >= 44, `${lang} ${sel}: ${m.width}x${m.height}`);
      for (const sel of ['#upload-step', '#columns li', '#upload-limits', '#upload-saves', 'label[for=upload-file]']) {
        for (const m of await measure(p, sel)) assert.ok(m.fontPx >= 14 && m.contrast >= 4.5, `${lang} ${sel}: ${m.fontPx} px, ${m.contrast.toFixed(2)}`);
      }
      await checkIn(p, 'school', classMixed());
      for (const sel of ['#add', '#another']) for (const m of await measure(p, sel)) assert.ok(m.width >= 44 && m.height >= 44, `${lang} ${sel}: ${m.width}x${m.height}`);
      for (const sel of ['#summary p', '#refused-rows td', '#add-rows td', '#refused-title', '#add-title']) {
        for (const m of await measure(p, sel)) assert.ok(m.fontPx >= 14 && m.contrast >= 4.5, `${lang} ${sel} "${m.text}": ${m.fontPx} px, ${m.contrast.toFixed(2)}`);
      }
      await checkIn(p, 'school', passing(uniq(), 2));
      await add(p);
      for (const sel of ['#added a.person', '#back-people', '#to-group']) for (const m of await measure(p, sel)) assert.ok(m.height >= 44 && m.width >= 44, `${lang} ${sel}: ${m.width}x${m.height}`);
      for (const sel of ['#done-meta', '#done-no-password', '#added .tag']) {
        for (const m of await measure(p, sel)) assert.ok(m.fontPx >= 14 && m.contrast >= 4.5, `${lang} ${sel}: ${m.fontPx} px, ${m.contrast.toFixed(2)}`);
      }
      // W3b-1b: the send buttons, the person-page line, the back link, Earlier uploads.
      for (const m of await measure(p, '#added a.send-link')) assert.ok(m.height >= 44 && m.width >= 44 && m.fontPx >= 14 && m.contrast >= 4.5, `${lang} send button: ${m.width}x${m.height}, ${m.fontPx} px, ${m.contrast.toFixed(2)}`);
      await Promise.all([p.waitForEvent('load'), p.click('#added a.person')]);
      for (const m of await measure(p, '#no-password-line')) assert.ok(m.fontPx >= 14 && m.contrast >= 4.5, `${lang} person-page line: ${m.fontPx} px, ${m.contrast.toFixed(2)}`);
      await p.goBack();
      await Promise.all([p.waitForEvent('load'), p.click('#added a.send-link')]);
      for (const m of await measure(p, '#back-upload')) assert.ok(m.height >= 44 && m.width >= 44 && m.fontPx >= 14 && m.contrast >= 4.5, `${lang} back link: ${m.width}x${m.height}`);
      await visit(p, uploadPath(w.school));
      for (const m of await measure(p, '#uploads a')) assert.ok(m.height >= 44 && m.width >= 44 && m.fontPx >= 14 && m.contrast >= 4.5, `${lang} earlier upload "${m.text}": ${m.width}x${m.height}, ${m.fontPx} px`);
      for (const m of await measure(p, '#uploads-title')) assert.ok(m.fontPx >= 14 && m.contrast >= 4.5, `${lang} Earlier uploads heading`);
    }
  });
});
